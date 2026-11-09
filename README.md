# VOICE / VALUE — 인터뷰 리워드

테스트 배포: https://interview.43.202.185.137.sslip.io · 운영자: https://interview.43.202.185.137.sslip.io/admin

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

웹: http://localhost:3410 · 운영자: http://localhost:3410/admin. 모든 브라우저 API는 Next의 동일 출처 프록시를 통해 호출한다. API는 127.0.0.1:3411에만 바인딩한다.

## 첫 화면

`/`는 랜딩이 아니라 로그인된 김하늘 예시 계정의 워크스페이스다. `인터뷰 참여자` 탭은 캠페인·내역·리워드를, `캠페인 집행` 탭은 캠페인 목록·생성·수동/자동 모드·승인을 보여준다. 예시 데이터 변경은 화면 내 샘플 상태만 변경하고 실제 API·자산에는 영향을 주지 않는다. 실제 운영은 `/admin`, 실제 참여는 `/?invite=...`로 연결된다.

## 핵심 흐름

1. 운영자 키로 로그인하고 질문 1–5개와 지급 방식(manual/automatic)을 지정해 일회 참여 링크를 만든다.
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

`deploy/ecosystem.config.cjs`는 확인된 moted EC2의 Docker 게이트웨이(172.18.0.1)를 사용한다. 외부 공개는 Caddy HTTPS만 사용하며 앱 포트는 보안 그룹에 추가하지 않는다. `deploy/install.sh`는 환경 파일이 준비된 새 배포 폴더에서 의존성·Prisma·프로세스 시작을 수행한다. 로컬에서 미리 `web/.next`와 `backend/dist`를 빌드해 전달한다.

배포 전 기존 Caddyfile을 백업하고 `interview.43.202.185.137.sslip.io` 호스트 블록만 추가한다. Caddy validate 후 reload한다. 복구는 새 PM2 프로세스 두 개를 중지하고 Caddyfile 백업을 복원한다. 기존 서비스나 DB에는 변경하지 않는다. 승인받은 임시 SSH 규칙은 배포 종료 후 제거한다.
