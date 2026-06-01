# dv-cli

Doctor-Ville CLI wrapper — 로그인, 포인트 조회, 포인트 교환

## 설치

```bash
git clone https://github.com/wooooooooooook/dv-cli.git
cd dv-cli
npm install
```

## 환경 설정

`.env` 파일에 로그인 정보 및 수신자 정보 입력:

```
DV_USER=your_email
DV_PASS=your_password

# 포인트 교환(네이버페이/배민)에 필요한 수신자 정보
USER_NAME=이름
USER_PHONE_1=010
USER_PHONE_2=1234
USER_PHONE_3=5678
```

## 사용법

```bash
npx tsx src/cli.ts login       # 로그인
npx tsx src/cli.ts point       # 포인트 조회
npx tsx src/cli.ts naverpay    # 네이버페이 포인트 교환
npx tsx src/cli.ts baemin      # 배민 포인트 교환
```

또는 npm scripts:

```bash
npm run login
npm run point
npm run naverpay
npm run baemin
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `login` | 닥터빌 로그인 (세션 쿠키 저장) |
| `point` | 현재 보유 포인트 조회 |
| `naverpay` | 네이버페이 포인트 교환 |
| `baemin` | 배민 포인트 교환 |

## 프로젝트 구조

```
dv-cli/
├── src/
│   ├── cli.ts                        # CLI 엔트리포인트
│   ├── types.ts                      # 타입 정의
│   ├── tasks/
│   │   ├── login.ts                  # 로그인
│   │   ├── check_point.ts            # 포인트 조회
│   │   ├── naverpay_point_exchange.ts  # 네이버페이 교환
│   │   └── baemin_point_exchange.ts    # 배민 교환
│   ├── modules/utils.ts              # 공통 유틸
│   └── services/
│       ├── logger.ts                 # 로그 (스텁)
│       └── bot_instance.ts           # 텔레그램 봇 (스텁)
├── .env.example
├── package.json
└── tsconfig.json
```
