# VOICE / VALUE — 인터뷰 리워드

프론트(Vercel): https://interview-rewards.vercel.app · API(EC2): https://interview.43.202.185.137.sslip.io/api/health

Figma: https://www.figma.com/design/wAQhZ60tO1hi7ogLknvPJz?node-id=6-2

현재 웹·API는 배포됨. 테스트 자산 미충전으로 송금은 비활성이고 온체인 확정 검증은 남아 있다. [QA 보고서](QA.md)를 참고한다.

`full-template` 기반 Next.js + NestJS + Prisma MVP. AI 인터뷰 → 별도 AI Judge → 수동 승인 또는 자동 지급. Base Sepolia와 Solana Devnet의 네이티브 테스트 자산만 사용한다.

## 실행

```sh
pnpm install --frozen-lockfile
cp backend/.env.example backend/.env
# backend/.env에 OPENAI_API_KEY, 32자 이상 ADMIN_TOKEN을 설정
pnpm --dir backend prisma:generate
touch backend/prisma/interview.db
pnpm --dir backend db:migrate
pnpm --dir backend build
pnpm --dir backend start
# 다른 터미널
pnpm --dir web dev
```

웹: http://localhost:3410 · 운영자: http://localhost:3410/admin. 모든 브라우저 API는 Next의 동일 출처 프록시를 통해 호출한다. 로컬 API는 127.0.0.1:3411에 바인딩한다. Vercel의 `API_ORIGIN`은 EC2 HTTPS 주소이며, Proxy가 브라우저 Origin을 확인한 뒤 쿠키와 요청을 EC2로 전달한다.

## 첫 화면

`/`에 42px 높이의 상단 고정 역할 바와 체험 계정 화면을 바로 표시한다. `인터뷰 참여자 / 캠페인 집행` 선택에 따라 본문이 전환된다. 서버가 HttpOnly 쿠키로 브라우저별 체험 계정을 발급하고, 목 인터뷰 캠페인 8개를 실제 DB에 만든다. 캠페인 생성·질문 저장·참여 링크 발급·승인은 모두 EC2 API와 연결되어 있다. 계정 세션은 8시간이며, 개인 신원 인증은 아니다.

캠페인은 계정당 10개, 링크는 캠페인당 20개로 제한한다. 다른 체험 계정의 캠페인·답변·승인에는 접근할 수 없다. 예전 샘플 잔액과 완료 내역을 제거했고 실제 저장된 결과만 보여준다.

## 목 인터뷰

독서·쇼핑·식사·운동·여행·협업·AI 도구·구독 서비스의 8개 주제를 제공한다. 주제마다 질문 2–4개가 있으며 수동 승인 4개, 자동 지급 4개다. 참여자 탭에서 바로 인터뷰룸에 입장하거나 캠페인 집행 탭에서 질문과 참여 링크를 확인할 수 있다.

템플릿은 `backend/src/mock-studies.ts`에서 관리한다. 새 계정에 자동 등록하고 기존 계정에도 다음 페이지 로드 시 누락 주제를 추가한다. 기존 캠페인·질문을 덮어쓰지 않으며 계정당 10개 한도를 유지한다. 예시 질문만 제공하고 가짜 답변·점수·지급 완료 내역은 생성하지 않는다. 실제 참여에는 지갑 서명과 마이크가 필요하다.

[현재 PRD](인터뷰%20리워드-prd.md)

## 핵심 흐름

1. 로그인된 체험 계정의 캠페인 집행 탭에서 질문 1–5개와 지급 방식(manual/automatic)을 저장한 뒤 `/room/<token>` 일회 참여 링크를 발급한다. `/admin`은 기존 운영자 키가 필요한 관리 경로로 유지한다.
2. 참여자는 Base/Solana 및 MetaMask/Phantom을 선택한다. 지갑 메시지 서명은 주소 소유 확인이며 사용자 자산을 이동하지 않는다. 지급 네트워크는 서명 메시지에 명시하며 서버가 테스트넷을 강제한다.
3. 카메라는 로컬 미리보기만 제공한다. 답변별 음성을 서버로 전송해 OpenAI가 전사하며, AI는 이전 답변과 다음 질문을 연결한다. 질문별 최대 3분이다. 원본 음성은 메모리에서만 처리하고 저장하지 않는다.
4. 별도 Judge 호출이 구체성·근거·관련성을 0–2점으로 평가한다. 엄격한 JSON 스키마와 실제 발언 인용을 서버에서 검증한다. 오류·근거 불일치 시 검토 상태이며 송금하지 않는다.
5. 수동 모드는 `awaiting_approval`에서 운영자 승인 후 `queued`로 이동한다. 자동 모드는 평가 확정 후 바로 `queued`다. 보상은 `floor(maxReward × score / 100)`이다.
6. 서버는 서명한 거래를 먼저 DB에 저장하고 같은 거래만 재전송·조회한다. Base는 finalized 블록, Solana는 finalized signature 확인 후 지급 완료로 표시한다. 실패/만료 거래는 자동으로 새 거래를 만들지 않는다.

## 설정 및 운영 제한

- 운영망과 ERC20/SPL 토큰은 현재 제외. `@solana/spl-token`은 사용자 승인으로 설치했지만 네이티브 테스트 SOL만 사용한다.
- `BASE_PRIVATE_KEY`, `SOLANA_SECRET_KEY`는 테스트 지급 전용 키. 후자는 64바이트 배열의 JSON이다. 실제 자산 키를 넣지 않는다.
- `BASE_BUDGET` / `SOLANA_BUDGET`은 최대 총 지급 예산(최소 단위 정수), `*_MAX_REWARD`는 인터뷰당 상한. 시작 시 최대액을 예약한다. 0 예산이면 참여 시작이 거부된다.
- 기본 상한은 Base 0.00001 테스트 ETH, Solana 0.001 테스트 SOL. 실제 예산과 지급 지갑의 가스 잔액을 확인한 뒤 설정한다.
- `PAYOUT_ENABLED=true` 전까지 워커는 송금하지 않는다. 비활성 상태에서는 지급 대기만 표시한다. 운영자 화면에서 설정 여부를 확인한다.
- SQLite DB는 신규 서비스 전용이다. 하나의 API/지급 워커만 실행한다. 다중 인스턴스나 공용 지급 키 사용은 지원하지 않는다.
- 전사·평가 근거는 완료/중단 후 생성 기준 30일에 삭제한다. 검토 중인 건은 운영자가 먼저 해결해야 한다. 참여자 본인도 결과에서 삭제할 수 있다. 지급 기록·온체인 거래는 유지한다.
- 로컬 SQLite에는 애플리케이션 암호화가 없다. 제한된 초대 테스트만 수행하고 운영 공개 전 암호화 저장소/백업·보관 정책을 확정한다.
- 지갑 확장 프로그램의 실제 설치 버전별 호환성은 실기기 검수가 필요하다. Solana는 Wallet Standard, Base는 EIP-6963을 우선 사용한다.
- 로그인 세션은 HttpOnly 쿠키이며 운영자 세션은 재시작 시 만료된다. 초대+기존 지갑 서명으로 참여 세션을 복구할 수 있다. 개인 고유 인물 인증은 아니다.
- 음성 질문을 듣지 못해도 화면 질문으로 답변할 수 있다. 오프라인·모바일 앱·사람이 진행하는 인터뷰는 범위 밖이다.

## 검증

```sh
pnpm check
```

서명/보상 단위 테스트와 일회용 SQLite DB 기반 HTTP 권한·중복 승인 통합 테스트를 포함한다. `backend/test`의 샘플 비밀값은 테스트 전용 고정값이며 운영에 사용하지 않는다.

## 배포

프론트는 Vercel `interview-rewards`, 서버는 기존 moted EC2의 `interview-rewards-api` PM2 프로세스다. 이전 EC2 웹 프로세스는 종료했다. EC2 Nest 서버는 `LISTEN_HOST=172.18.0.1`로 Docker 게이트웨이에서 수신하고, 기존 Caddy가 `/api/*`만 API에 전달한다. 그 외 기존 EC2 웹 주소는 Vercel로 리다이렉트한다. 앱 포트는 보안 그룹에 추가하지 않는다.

프론트 단독 배포 준비 및 실행:

```sh
node scripts/prepare-web-deploy.cjs
pnpm --dir web check
vercel deploy --prod --yes --scope nahyunbak-navercoms-projects --cwd web
```

`web/pnpm-lock.yaml`은 루트 lock의 web importer와 동일 버전으로 만든 단독 배포용 잠금 파일이다. 루트 의존성 변경 시 준비 스크립트를 다시 실행한다. Vercel에는 공개 `API_ORIGIN`만 설정하며 OpenAI·지갑 키는 EC2에만 둔다. 캡처 스크립트는 로컬 개발에서 `FIGMA_CAPTURE=true`일 때만 활성화된다.

API는 로컬에서 `backend/dist`를 빌드하고 `backend/prisma`와 함께 EC2에 전달한 뒤 클라이언트 생성·마이그레이션·API 재시작을 수행한다. `deploy/install.sh`와 API 전용 PM2 설정을 참고한다. 기존 다른 서비스와 DB는 수정하지 않는다.

Vercel 프록시의 요청 크기를 고려해 프론트 음성은 64kbps·최대 3분·2.5MB로 제한한다. 체인 확정 전에는 지급 완료를 표시하지 않는다. 테스트 지갑 충전과 온체인 송금 검증은 아직 남아 있다.
