const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_PIN = process.env.ADMIN_PIN ? String(process.env.ADMIN_PIN) : '';
const STATE_FILE = path.join(__dirname, 'state.json');
const GITHUB_SYNC_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.GITHUB_SYNC_ENABLED || '').toLowerCase());
const GITHUB_DATA_DIR = process.env.GITHUB_DATA_DIR || path.join(__dirname, '.github-data');
const ENTRY_FEE = 20000;
const MATCHES = [
  { id: 'czech', label: '한국 vs 체코' },
  { id: 'mexico', label: '한국 vs 멕시코' },
  { id: 'southafrica', label: '한국 vs 남아공' },
];
const PICKS = new Set(['승', '무', '패']);
const DEFAULT_STATE = { players: [], results: {}, logs: [] };

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      results: parsed.results && typeof parsed.results === 'object' ? parsed.results : {},
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

let githubSyncQueue = Promise.resolve();

async function syncStateToGitHub(state, reason) {
  if (!GITHUB_SYNC_ENABLED) return;
  if (!fs.existsSync(path.join(GITHUB_DATA_DIR, '.git'))) {
    console.error(`[github-sync] ${GITHUB_DATA_DIR} is not a git repository. Skipping backup.`);
    return;
  }

  const exported = {
    syncedAt: new Date().toISOString(),
    source: 'maegukcup-local-server',
    state,
  };
  fs.writeFileSync(
    path.join(GITHUB_DATA_DIR, 'state.json'),
    JSON.stringify(exported, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(GITHUB_DATA_DIR, 'README.md'),
    '# maegukcup-data\n\nPrivate real-time backup snapshots for maegukcup submissions.\n\nDo not make this repository public.\n',
    'utf8'
  );

  await runCommand('git', ['add', 'README.md', 'state.json'], GITHUB_DATA_DIR);
  try {
    await runCommand('git', ['diff', '--cached', '--quiet'], GITHUB_DATA_DIR);
    return;
  } catch (error) {
    if (error.code !== 1) throw error;
  }

  const safeReason = String(reason || 'state update').slice(0, 80);
  await runCommand('git', ['commit', '-m', `Update state: ${safeReason}`], GITHUB_DATA_DIR);
  await runCommand('git', ['push', 'origin', 'main'], GITHUB_DATA_DIR);
  console.log(`[github-sync] backed up state to GitHub: ${safeReason}`);
}

function queueGitHubSync(state, reason) {
  if (!GITHUB_SYNC_ENABLED) return;
  const snapshot = structuredClone(state);
  githubSyncQueue = githubSyncQueue
    .then(() => syncStateToGitHub(snapshot, reason))
    .catch(error => {
      console.error('[github-sync] failed:', error.stderr || error.stdout || error.message);
    });
}

function writeState(state, reason = 'state update') {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  queueGitHubSync(state, reason);
}

function checkedCount(state) {
  return MATCHES.filter(m => state.results[m.id]).length;
}

function isLocked(state) {
  return checkedCount(state) > 0;
}

function playerStatus(state, player) {
  for (const match of MATCHES) {
    const result = state.results[match.id];
    if (result && player.picks[match.id] !== result) {
      return { status: '탈락', failedMatch: match.label };
    }
  }
  if (checkedCount(state) === MATCHES.length) return { status: '우승', failedMatch: null };
  return { status: '생존', failedMatch: null };
}

function alivePlayers(state) {
  return state.players.filter(p => playerStatus(state, p).status !== '탈락');
}

function winners(state) {
  if (checkedCount(state) !== MATCHES.length) return [];
  return state.players.filter(p => playerStatus(state, p).status === '우승');
}

function publicState() {
  const state = readState();
  const winnerList = winners(state);
  const pot = state.players.length * ENTRY_FEE;
  return {
    matches: MATCHES,
    entryFee: ENTRY_FEE,
    locked: isLocked(state),
    results: state.results,
    checkedCount: checkedCount(state),
    pot,
    prizePerWinner: winnerList.length ? Math.floor(pot / winnerList.length) : 0,
    players: state.players.map(p => ({ ...p, ...playerStatus(state, p) })),
    aliveCount: alivePlayers(state).length,
    winners: winnerList.map(p => p.name),
    logs: state.logs,
  };
}

function validatePicks(picks) {
  if (!picks || typeof picks !== 'object') throw new Error('승무패를 입력해 주세요.');
  for (const match of MATCHES) {
    if (!PICKS.has(picks[match.id])) throw new Error(`${match.label} 예측은 승/무/패 중 하나여야 합니다.`);
  }
}

function addPlayer(name, picks) {
  const state = readState();
  if (isLocked(state)) throw new Error('이미 경기 결과 입력이 시작되어 참가가 마감됐습니다.');
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('참가자 이름을 입력해 주세요.');
  if (cleanName.length > 20) throw new Error('이름은 20자 이내로 입력해 주세요.');
  if (state.players.some(p => p.name === cleanName)) throw new Error('이미 등록된 이름입니다.');
  validatePicks(picks);
  state.players.push({
    id: crypto.randomUUID(),
    name: cleanName,
    picks,
    joinedAt: new Date().toISOString(),
  });
  writeState(state, `player joined: ${cleanName}`);
  return publicState();
}

function setResult(matchId, result, adminPin) {
  if (!ADMIN_PIN) throw new Error('관리자 PIN이 서버에 설정되지 않았습니다. ADMIN_PIN 환경변수를 설정해 주세요.');
  if (String(adminPin || '') !== ADMIN_PIN) throw new Error('관리자 PIN이 틀렸습니다.');
  if (!PICKS.has(result)) throw new Error('경기 결과는 승/무/패 중 하나여야 합니다.');
  const match = MATCHES.find(m => m.id === matchId);
  if (!match) throw new Error('알 수 없는 경기입니다.');
  const state = readState();
  if (state.results[matchId]) throw new Error('이미 결과가 입력된 경기입니다.');

  const beforeAlive = new Set(alivePlayers(state).map(p => p.id));
  state.results[matchId] = result;
  const afterAlive = new Set(alivePlayers(state).map(p => p.id));
  const eliminated = state.players.filter(p => beforeAlive.has(p.id) && !afterAlive.has(p.id));
  state.logs.unshift({
    at: new Date().toISOString(),
    match: match.label,
    result,
    eliminated: eliminated.map(p => p.name),
  });
  writeState(state, `result entered: ${match.label} ${result}`);
  return publicState();
}

function reset(adminPin) {
  if (!ADMIN_PIN) throw new Error('관리자 PIN이 서버에 설정되지 않았습니다. ADMIN_PIN 환경변수를 설정해 주세요.');
  if (String(adminPin || '') !== ADMIN_PIN) throw new Error('관리자 PIN이 틀렸습니다.');
  writeState(structuredClone(DEFAULT_STATE), 'admin reset');
  return publicState();
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(text);
}

async function parseBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('요청 형식이 올바르지 않습니다.'); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
      return sendText(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, port: PORT });
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, 200, publicState());
    }
    if (req.method === 'POST' && url.pathname === '/api/players') {
      const body = await parseBody(req);
      return sendJson(res, 200, addPlayer(body.name, body.picks));
    }
    if (req.method === 'POST' && url.pathname === '/api/results') {
      const body = await parseBody(req);
      return sendJson(res, 200, setResult(body.matchId, body.result, body.adminPin));
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      const body = await parseBody(req);
      return sendJson(res, 200, reset(body.adminPin));
    }
    return sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || '오류가 발생했습니다.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`football-pick-mini-game listening on http://${HOST}:${PORT}`);
  console.log(`admin pin configured: ${Boolean(ADMIN_PIN)}`);
});
