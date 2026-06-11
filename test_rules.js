// Lightweight rule tests for the football pick mini game.
// Run: node test_rules.js

const ENTRY_FEE = 20000;
const MATCHES = [
  { id: 'czech', label: '한국 vs 체코' },
  { id: 'mexico', label: '한국 vs 멕시코' },
  { id: 'southafrica', label: '한국 vs 남아공' },
];
let state;

function reset() { state = { players: [], results: {}, logs: [] }; }
function assertPickOnly(value) { return ['승', '무', '패'].includes(value); }
function getCheckedCount() { return MATCHES.filter(m => state.results[m.id]).length; }
function getParticipantPot() { return state.players.length * ENTRY_FEE; }
function getPlayerStatus(player) {
  for (const match of MATCHES) {
    const result = state.results[match.id];
    if (result && player.picks[match.id] !== result) {
      return { status: '탈락', failedMatch: match.label };
    }
  }
  if (getCheckedCount() === MATCHES.length) return { status: '우승', failedMatch: null };
  return { status: '생존', failedMatch: null };
}
function getAlivePlayers() { return state.players.filter(p => getPlayerStatus(p).status !== '탈락'); }
function getWinners() {
  if (getCheckedCount() !== MATCHES.length) return [];
  return state.players.filter(p => getPlayerStatus(p).status === '우승');
}
function addPlayer(name, picks) {
  if (!name.trim()) throw new Error('참가자 이름을 입력해 주세요.');
  for (const match of MATCHES) {
    if (!assertPickOnly(picks[match.id])) throw new Error(`${match.label} 예측은 승/무/패 중 하나여야 합니다.`);
  }
  state.players.push({ id: `${state.players.length + 1}`, name, picks });
}
function setResult(matchId, result) {
  if (!assertPickOnly(result)) throw new Error('경기 결과는 승/무/패 중 하나여야 합니다.');
  const beforeAlive = new Set(getAlivePlayers().map(p => p.id));
  state.results[matchId] = result;
  const afterAlive = new Set(getAlivePlayers().map(p => p.id));
  return state.players.filter(p => beforeAlive.has(p.id) && !afterAlive.has(p.id));
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\nexpected: ${e}\nactual:   ${a}`);
}

reset();
addPlayer('재형', { czech: '승', mexico: '무', southafrica: '승' });
addPlayer('미나', { czech: '승', mexico: '패', southafrica: '승' });
addPlayer('마음', { czech: '무', mexico: '무', southafrica: '승' });
addPlayer('유겸', { czech: '승', mexico: '무', southafrica: '패' });
eq(getParticipantPot(), 80000, '참가자당 2만원씩 총상금 계산');

let eliminated = setResult('czech', '승');
eq(eliminated.map(p => p.name), ['마음'], '1경기 결과 입력 시 틀린 참가자 탈락');
eq(getAlivePlayers().map(p => p.name), ['재형', '미나', '유겸'], '1경기 후 생존자');

eliminated = setResult('mexico', '무');
eq(eliminated.map(p => p.name), ['미나'], '2경기 결과 입력 시 추가 탈락');
eq(getAlivePlayers().map(p => p.name), ['재형', '유겸'], '2경기 후 생존자');

eliminated = setResult('southafrica', '승');
eq(eliminated.map(p => p.name), ['유겸'], '3경기 결과 입력 시 추가 탈락');
eq(getWinners().map(p => p.name), ['재형'], '세 경기 모두 맞힌 사람만 우승');
eq(getParticipantPot() / getWinners().length, 80000, '단독 우승 상금');

reset();
addPlayer('A', { czech: '승', mexico: '무', southafrica: '승' });
addPlayer('B', { czech: '승', mexico: '무', southafrica: '승' });
setResult('czech', '승');
setResult('mexico', '무');
setResult('southafrica', '승');
eq(getWinners().map(p => p.name), ['A', 'B'], '공동 우승 허용');
eq(getParticipantPot() / getWinners().length, 20000, '공동 우승 균등 분배');

let invalidRejected = false;
try { addPlayer('오입력', { czech: '이김', mexico: '무', southafrica: '승' }); } catch { invalidRejected = true; }
eq(invalidRejected, true, '승무패 외 입력 거부');

console.log('✅ 모든 규칙 테스트 통과');
