# 인터뷰 리워드 검증 — 2026-11-09

배포: https://interview.43.202.185.137.sslip.io

## 확인 완료

- `full-template`의 Next.js·NestJS·Prisma 기반 구성, 서버/웹 lint·typecheck·production build 통과.
- 서버 테스트 7개: 점수/정수 보상 계산, 수동 승인 대기, 잘못된 근거 거부, 질문 정책, Base/Solana 실제 서명 검증, HTTP 권한·일회 서명·중복 승인·CSRF·전사 삭제.
- 지갑 어댑터 테스트 5개: 네 체인/지갑 조합의 공급자 선택·메시지 서명 호출과 미설치 오류. 이 테스트는 공급자 모의 구현이며 실제 확장 프로그램 검수가 아니다.
- OpenAI 실제 호출: 생성된 한국어 음성의 TTS→전사→별도 Judge→근거 연결 성공.
- 실제 EC2 HTTPS API에서 네 조합 모두 임시 테스트 지갑 서명→초대 인증→음성 전사→평가 확정 성공. 수동은 승인 전 awaiting_approval, 승인 후 queued. 자동은 바로 queued. 중복 수동 승인 호출 후 지급 건 1개.
- 실제 브라우저: 운영자 로그인, 수동 초대 생성, 참여 준비, Base/Solana·MetaMask/Phantom 선택, 보상 단위 변경, 동의 전 연결 차단, 결과의 점수·근거·지급 대기 렌더링.
- 데스크톱 및 390px 화면 캡처. 본인 결과 접근 쿠키는 별도 비공개 QA 세션이며 Drive에 업로드하지 않음.
- 기존 moted EC2에서 API/웹 독립 PM2 프로세스, 서비스 전용 SQLite와 환경 파일 사용. Caddy 기존 호스트 블록 보존 후 신규 HTTPS 호스트 추가. API는 외부 포트를 열지 않음.

## 미검증 및 제한

- 실제 지갑 확장 프로그램 네 조합에서 사용자가 승인하는 연결·서명 및 실제 카메라/마이크 발화는 미검증. 서버 서명 검증과 공급자 선택 테스트를 실제 지갑 검수로 대체했다고 표현하지 않는다.
- 실제 온체인 송금·확정은 미검증. 지급 전용 지갑에 테스트 ETH/SOL이 없으며 송금 워커는 비활성 상태다. Solana 공식 RPC faucet은 410을 반환했고 웹 faucet은 CAPTCHA 위젯이 빈 상태로 표시되어 수령하지 못했다.
- 테스트 ETH/SOL 충전 후 `PAYOUT_ENABLED=true`로 활성화하고, 수동 승인 및 자동 지급 각각의 거래 확정과 중복 재전송을 실제 체인에서 추가 검증해야 한다.
- 실제 사용자 개인정보 처리 전 보관·암호화·AI 처리 고지와 운영 정책 확인 필요. SQLite 애플리케이션 암호화·다중 서버 워커·운영망 자산은 현 범위 밖이다.
- OpenAI 전용 키는 30일 만료이며 Audio·Chat completions 요청 권한만 부여했다. 만료 전 운영자가 갱신해야 한다.

## 지급 지갑 (테스트넷 전용)

- Base Sepolia: `0x952BFB93f705A4D794a0e1E8f6F2777D107b11F7`
- Solana Devnet: `3ye6cp7xJfQX7K7QCwyzMMaVUDFH3vTK9r9GPjULp4T6`

실자산을 보내지 않는다. 테스트넷으로 표시된 faucet만 사용한다.

QA 증거: https://drive.google.com/drive/folders/13YLud7h_ehdSSIe1Ccae6wsYdGUy8thV

## 최종 UI 변경 — 로그인된 예시 워크스페이스

- 기본 `/`에서 랜딩을 제거하고 `인터뷰 참여자 / 캠페인 집행` 두 탭을 직접 표시한다. 김하늘 예시 계정·샘플 데이터를 미리 제공한다.
- 실제 배포 브라우저에서 탭 전환, 캠페인 초안 생성, 자동 지급 모드 선택, 수동 승인 후 버튼 비활성·대기 건수 변경 확인.
- 예시 변경은 클라이언트 샘플 상태이며 실제 캠페인·서명·AI 호출·지급 DB와 분리된다. 실제 운영은 `/admin`, 실제 인터뷰는 발급한 초대 링크로 이용한다.
- 최신 화면 증거는 `dashboard-participant.png`, `dashboard-campaign.png`, `campaign-create.png`, `dashboard-mobile.png`다. 기존 home/participant 이미지는 변경 전 QA 기록이다.
- 최종 웹 lint·typecheck·build 및 지갑 어댑터 테스트 5개 통과. 기존 API 테스트 7개와 배포 네 조합 검증 결과 유지.
