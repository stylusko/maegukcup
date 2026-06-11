# 매국베팅

대한민국 월드컵 조별예선 3경기 승/무/패를 맞히는 미니게임입니다.

## 기능

- 참가자 이름과 3경기 승/무/패 예측 등록
- 제출 후 예측 수정 불가
- 2승 이상 예측 시 애국자 판정
- 패가 많거나 승률 50% 미만일 때 매국노 모드 판정
- 참가자 목록/총상금/생존자 현황 표시
- `/admin` 전용 관리자 결과 입력 화면
- 관리자 PIN 기반 결과 확정 및 초기화
- 모바일 표 가로 스크롤 지원

## 실행

```bash
ADMIN_PIN=1234 PORT=8787 npm start
```

접속 주소:

- 참가자 화면: `http://127.0.0.1:8787/`
- 관리자 화면: `http://127.0.0.1:8787/admin`

## 테스트

```bash
npm test
```

API 통합 테스트는 서버를 먼저 띄운 뒤 실행합니다.

```bash
ADMIN_PIN=1234 PORT=8787 npm start
ADMIN_PIN=1234 TEST_BASE=http://127.0.0.1:8787 node test_api.js
```

## 배포 메모

이 앱은 정적 GitHub Pages만으로는 동작하지 않습니다. `server.js`와 JSON 상태 저장을 사용하는 Node.js 서버형 앱이므로 Render, Railway, Fly.io, VPS, 또는 Cloudflare Tunnel 같은 서버 실행 환경이 필요합니다.

`state.json`은 참가자/결과 데이터 파일이므로 Git에 커밋하지 않습니다.
