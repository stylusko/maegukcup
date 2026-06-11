// API integration tests for deployed-style football pick mini game.
// Requires server running on TEST_BASE or http://127.0.0.1:8787
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8787';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

async function api(path, body) {
  const res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(json.error || 'request failed');
  return json;
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\nexpected: ${e}\nactual:   ${a}`);
}

async function main() {
  await api('/api/reset', { adminPin: ADMIN_PIN });
  let s = await api('/api/state');
  eq(s.players.length, 0, 'reset clears players');

  await api('/api/players', { name: '재형', picks: { czech: '승', mexico: '무', southafrica: '승' } });
  await api('/api/players', { name: '미나', picks: { czech: '승', mexico: '패', southafrica: '승' } });
  await api('/api/players', { name: '마음', picks: { czech: '무', mexico: '무', southafrica: '승' } });
  await api('/api/players', { name: '유겸', picks: { czech: '승', mexico: '무', southafrica: '패' } });
  s = await api('/api/state');
  eq(s.players.length, 4, 'four participants added');
  eq(s.pot, 80000, 'participant fee pot');

  await api('/api/results', { adminPin: ADMIN_PIN, matchId: 'czech', result: '승' });
  s = await api('/api/state');
  eq(s.locked, true, 'registration locks after first result');
  eq(s.players.find(p => p.name === '마음').status, '탈락', 'wrong first match eliminated');
  let joinRejected = false;
  try { await api('/api/players', { name: '늦은참가', picks: { czech: '승', mexico: '무', southafrica: '승' } }); } catch { joinRejected = true; }
  eq(joinRejected, true, 'late join rejected');

  await api('/api/results', { adminPin: ADMIN_PIN, matchId: 'mexico', result: '무' });
  await api('/api/results', { adminPin: ADMIN_PIN, matchId: 'southafrica', result: '승' });
  s = await api('/api/state');
  eq(s.winners, ['재형'], 'only all-correct participant wins');
  eq(s.prizePerWinner, 80000, 'single winner gets full pot');

  await api('/api/reset', { adminPin: ADMIN_PIN });
  console.log('✅ API 통합 테스트 통과');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
