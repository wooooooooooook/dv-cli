# dv-cli

Doctor-Ville CLI wrapper — 로그인, 포인트 조회, 포인트 교환

## 설치

```bash
git clone https://github.com/wooooooooooook/dv-cli.git
cd dv-cli
npm install
```

## 환경 설정

`.env` 파일 생성:

```
# 닥터빌 로그인
DV_USER=your_email
DV_PASS=your_password

# 포인트 교환용 수신자 정보 (naverpay / baemin / kakaopay)
USER_NAME=이름
USER_PHONE_1=010
USER_PHONE_2=1234
USER_PHONE_3=5678
```

## 사용법

```bash
# 명령줄에서 직접 실행 (tsx)
npx tsx src/cli.ts login        # 로그인
npx tsx src/cli.ts point        # 포인트 조회
npx tsx src/cli.ts naverpay     # 네이버페이 포인트 교환
npx tsx src/cli.ts baemin       # 배민 포인트 교환
npx tsx src/cli.ts kakaopay     # 카카오페이 1만원권 (9,900원)
npx tsx src/cli.ts kakaopay5k   # 카카오페이 5천원권 (5,000원)
npx tsx src/cli.ts kakaopay3k   # 카카오페이 3천원권 (3,000원)
npx tsx src/cli.ts attendance   # 출석 체크
npx tsx src/cli.ts today_quiz   # 오늘의 퀴즈

# 반복 구매 (환경변수 대신 -c 옵션 사용)
npx tsx src/cli.ts kakaopay -c 5      # 카카오페이 1만원권 5회
npx tsx src/cli.ts kakaopay5k -c 10   # 카카오페이 5천원권 10회
npx tsx src/cli.ts kakaopay3k -c 5    # 카카오페이 3천원권 5회
npx tsx src/cli.ts baemin -c 10       # 배민 1만원권 10회
npx tsx src/cli.ts naverpay -c 10     # 네이버페이 5천원권 10회

# npm scripts
npm run login
npm run point
```

## 명령어

| 명령어 | 설명 | 반복구매 옵션 |
|--------|------|-----------------|
| `login` | 닥터빌 로그인 (세션 쿠키 저장) | - |
| `point` | 현재 보유 포인트 조회 | - |
| `naverpay` | 네이버페이 5천원권 (4,900원) | `-c, --count <N>` |
| `baemin` | 배민 1만원권 (9,700원) | `-c, --count <N>` |
| `kakaopay` | 카카오페이 1만원권 (9,900원) | `-c, --count <N>` |
| `kakaopay5k` | 카카오페이 5천원권 (5,000원) | `-c, --count <N>` |
| `kakaopay3k` | 카카오페이 3천원권 (3,000원) | `-c, --count <N>` |
| `attendance` | 출석 체크 | - |
| `today_quiz` | 오늘의 퀴즈 | - |

> **반복 구매는 환경변수(`*_MAX_ITERATIONS`) 대신 CLI 옵션 `-c <N>` 또는 `--count <N>`을 사용하세요. 최대 10회로 제한됩니다.**

## 프로젝트 구조

```
dv-cli/
├── src/
│   ├── cli.ts                           # CLI 엔트리포인트
│   ├── types.ts                         # 타입 정의
│   ├── tasks/
│   │   ├── login.ts                     # 로그인
│   │   ├── check_point.ts               # 포인트 조회
│   │   ├── naverpay_point_exchange.ts   # 네이버페이 교환
│   │   ├── baemin_point_exchange.ts     # 배민 교환
│   │   ├── kakaopay_point_exchange.ts   # 카카오페이 1만원권
│   │   ├── kakaopay5k_point_exchange.ts # 카카오페이 5천원권
│   │   ├── attendance.ts                # 출석 체크
│   │   └── today_quiz.ts               # 오늘의 퀴즈
│   ├── modules/
│   │   └── utils.ts                    # 공통 유틸 (ensureLoggedIn, safeGoto 등)
│   └── services/
│       ├── logger.ts                   # 로그 (스텁)
│       └── bot_instance.ts             # 텔레그램 봇 (스텁)
├── .env                                # 환경변수 (절대 커밋 금지!)
├── package.json
└── tsconfig.json
```
