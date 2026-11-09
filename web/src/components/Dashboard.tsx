"use client";
import { useState } from "react";
type Campaign = {
  id: number;
  title: string;
  brand: string;
  topic: string;
  reward: string;
  chain: string;
  questions: string[];
  target: number;
  done: number;
  mode: "manual" | "automatic";
  status: "진행 중" | "초안";
};
const initial: Campaign[] = [
  {
    id: 1,
    title: "독서 기록이 끊기는 순간을 들려주세요",
    brand: "퀼리드",
    topic: "독서 · 라이프스타일",
    reward: "0.001 SOL",
    chain: "Solana",
    questions: [
      "최근 독서 기록 앱을 사용한 상황을 이야기해주세요.",
      "기록하는 과정에서 불편했던 점은 무엇인가요?",
      "어떤 변화가 있다면 계속 사용하고 싶으신가요?",
    ],
    target: 20,
    done: 12,
    mode: "manual",
    status: "진행 중",
  },
  {
    id: 2,
    title: "온라인 쇼핑, 결제 직전에 망설인 이유",
    brand: "장바구니 연구소",
    topic: "쇼핑 · 커머스",
    reward: "0.00001 ETH",
    chain: "Base",
    questions: [
      "최근 온라인 쇼핑 경험을 이야기해주세요.",
      "결제를 망설이게 한 요소가 있었나요?",
      "결정에 가장 도움이 된 정보는 무엇인가요?",
    ],
    target: 30,
    done: 18,
    mode: "automatic",
    status: "진행 중",
  },
  {
    id: 3,
    title: "새로운 습관을 시작하고 유지하는 방법",
    brand: "데일리 루프",
    topic: "습관 · 생산성",
    reward: "0.001 SOL",
    chain: "Solana",
    questions: [
      "최근 만들고 싶은 습관은 무엇인가요?",
      "습관을 유지하기 어려웠던 순간을 말해주세요.",
      "어떤 도움을 받고 싶으신가요?",
    ],
    target: 15,
    done: 4,
    mode: "manual",
    status: "진행 중",
  },
];
const history = [
  {
    name: "독서 앱 첫 사용 경험",
    date: "11.08",
    score: 92,
    reward: "0.00092 SOL",
    state: "지급 완료",
  },
  {
    name: "일정 관리 서비스 사용성",
    date: "11.06",
    score: 83,
    reward: "0.0000083 ETH",
    state: "승인 대기",
  },
];
export default function Dashboard() {
  const [tab, setTab] = useState<"participant" | "campaign">("participant"),
    [campaigns, setCampaigns] = useState(initial),
    [selected, setSelected] = useState<Campaign | null>(null),
    [detail, setDetail] = useState(false),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [questions, setQuestions] = useState(""),
    [chain, setChain] = useState("Solana"),
    [mode, setMode] = useState<"manual" | "automatic">("manual"),
    [approved, setApproved] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("전체"),
    [invite, setInvite] = useState("");
  const total = campaigns.reduce((n, c) => n + c.done, 0);
  function open(c: Campaign) {
    setSelected(c);
    setDetail(false);
  }
  return (
    <main id="main" className="workspace">
      <div className="workspace-top">
        <nav className="workspace-tabs" aria-label="서비스 이용 모드">
          <button
            aria-pressed={tab === "participant"}
            className={tab === "participant" ? "selected" : ""}
            onClick={() => setTab("participant")}
          >
            인터뷰 참여자
          </button>
          <button
            aria-pressed={tab === "campaign"}
            className={tab === "campaign" ? "selected" : ""}
            onClick={() => setTab("campaign")}
          >
            캠페인 집행
          </button>
        </nav>
        <div className="account">
          <span className="avatar">하</span>
          <div>
            <strong>김하늘</strong>
            <small>로그인된 예시 계정</small>
          </div>
        </div>
      </div>
      <div className="sample-note">
        <span>예시 데이터가 준비된 서비스 화면입니다.</span>
        <a href="/admin">실제 캠페인 운영 ↗</a>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {tab === "participant" ? (
        <>
          <div className="dashboard-title">
            <div>
              <span className="kicker">MY INTERVIEWS</span>
              <h1>하늘님, 어떤 경험을 나눠볼까요?</h1>
              <p>참여할 인터뷰와 내 리워드를 한곳에서 확인하세요.</p>
            </div>
            <span className="badge mint">
              참여 가능 {campaigns.filter((c) => c.status === "진행 중").length}
              개
            </span>
          </div>
          <div className="metrics">
            <article>
              <span>참여한 인터뷰</span>
              <strong>
                8<small>건</small>
              </strong>
              <p>최근 30일 기준</p>
            </article>
            <article>
              <span>내 평균 답변 점수</span>
              <strong>
                91<small>/ 100</small>
              </strong>
              <p>AI Judge 평가 기준</p>
            </article>
            <article className="reward-metric">
              <span>누적 리워드 · 예시</span>
              <strong>
                0.0058<small>SOL</small>
              </strong>
              <p>+ 0.000024 ETH</p>
            </article>
            <article>
              <span>지급 승인 대기</span>
              <strong>
                {approved ? 0 : 1}
                <small>건</small>
              </strong>
              <p>운영자 확인 후 지급</p>
            </article>
          </div>
          <div className="workspace-columns">
            <section>
              <div className="section-heading">
                <h2>참여 가능한 캠페인</h2>
                <div className="filters" aria-label="네트워크 필터">
                  {["전체", "Base", "Solana"].map((f) => (
                    <button
                      key={f}
                      aria-pressed={filter === f}
                      className={filter === f ? "chosen" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="campaign-cards">
                {campaigns
                  .filter(
                    (c) =>
                      c.status === "진행 중" &&
                      (filter === "전체" || c.chain === filter),
                  )
                  .map((c) => (
                    <article className="campaign-card" key={c.id}>
                      <div className="card-top">
                        <span
                          className={
                            "brand-icon " +
                            (c.chain === "Base" ? "base" : "sol")
                          }
                        >
                          {c.brand[0]}
                        </span>
                        <div>
                          <strong>{c.brand}</strong>
                          <small>{c.topic}</small>
                        </div>
                        <span className="badge">{c.chain}</span>
                      </div>
                      <h3>{c.title}</h3>
                      <p className="card-meta">
                        AI 인터뷰 · 질문 {c.questions.length}개 · 약{" "}
                        {c.questions.length * 2}분
                      </p>
                      <div className="capacity">
                        <div
                          style={{
                            width: `${Math.min(100, (c.done / c.target) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="card-footer">
                        <div>
                          <small>최대 리워드</small>
                          <strong>{c.reward}</strong>
                        </div>
                        <button onClick={() => open(c)}>참여하기 ↗</button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
            <aside>
              <div className="section-heading">
                <h2>내 참여 내역</h2>
                <span className="fine">최근 2건</span>
              </div>
              <div className="history-panel">
                {history.map((h, i) => (
                  <article key={h.name}>
                    <div className="history-date">
                      {h.date}
                      <span
                        className={
                          "status-badge " + (i === 0 || approved ? "paid" : "")
                        }
                      >
                        {i === 1 && approved ? "지급 완료" : h.state}
                      </span>
                    </div>
                    <h3>{h.name}</h3>
                    <div className="history-value">
                      <span>
                        답변 점수 <b>{h.score}</b>
                      </span>
                      <strong>{h.reward}</strong>
                    </div>
                  </article>
                ))}
              </div>
              <div className="wallet-panel">
                <span className="kicker">CONNECTED WALLET</span>
                <div className="section-heading">
                  <h3>연결된 지갑 · 예시</h3>
                  <span className="badge mint">Phantom</span>
                </div>
                <p className="wallet-address">
                  7Kp4…9mQ2 <span>Solana Devnet</span>
                </p>
                <p className="fine">
                  실제 인터뷰 참여 시 본인 지갑 서명으로 수령 주소를 확인합니다.
                </p>
              </div>
              <details className="invite-entry">
                <summary>받은 초대 링크로 참여</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      const u = new URL(invite);
                      const t = u.searchParams.get("invite");
                      if (!t) throw new Error();
                      location.href = "/?invite=" + encodeURIComponent(t);
                    } catch {
                      setNotice("유효한 인터뷰 초대 링크를 입력해주세요.");
                    }
                  }}
                >
                  <label>
                    초대 링크
                    <input
                      type="url"
                      value={invite}
                      onChange={(e) => setInvite(e.target.value)}
                      placeholder="https://…/?invite=…"
                      required
                    />
                  </label>
                  <button>초대 열기</button>
                </form>
              </details>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-title">
            <div>
              <span className="kicker">CAMPAIGN WORKSPACE</span>
              <h1>캠페인 집행</h1>
              <p>인터뷰 모집부터 답변 평가, 리워드 승인까지 관리하세요.</p>
            </div>
            <button
              onClick={() => {
                setName("");
                setQuestions("");
                setCreating(true);
              }}
            >
              ＋ 캠페인 만들기
            </button>
          </div>
          <div className="metrics">
            <article>
              <span>진행 중인 캠페인</span>
              <strong>
                {campaigns.filter((c) => c.status === "진행 중").length}
                <small>개</small>
              </strong>
              <p>질문과 지급 정책을 관리하세요</p>
            </article>
            <article>
              <span>완료된 인터뷰</span>
              <strong>
                {total}
                <small>건</small>
              </strong>
              <p>전체 캠페인 기준</p>
            </article>
            <article>
              <span>평균 답변 점수</span>
              <strong>
                88<small>/ 100</small>
              </strong>
              <p>AI Judge 평가 완료</p>
            </article>
            <article className="reward-metric">
              <span>지급 승인 대기</span>
              <strong>
                {approved ? 0 : 1}
                <small>건</small>
              </strong>
              <p>수동 지급 캠페인</p>
            </article>
          </div>
          <div className="section-heading">
            <h2>내 캠페인</h2>
            <span className="fine">{campaigns.length}개 캠페인</span>
          </div>
          <div className="campaign-table-wrap">
            <table className="campaign-table">
              <thead>
                <tr>
                  <th>캠페인</th>
                  <th>상태</th>
                  <th>인터뷰 진행</th>
                  <th>네트워크</th>
                  <th>지급 방식</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <small>
                        {c.brand} · 질문 {c.questions.length}개
                      </small>
                    </td>
                    <td>
                      <span className="badge mint">{c.status}</span>
                    </td>
                    <td>
                      <strong>{c.done}</strong> / {c.target}명
                    </td>
                    <td>{c.chain}</td>
                    <td>
                      <select
                        aria-label={`${c.title} 지급 방식`}
                        value={c.mode}
                        onChange={(e) => {
                          setCampaigns((rows) =>
                            rows.map((row) =>
                              row.id === c.id
                                ? {
                                    ...row,
                                    mode: e.target.value as
                                      | "manual"
                                      | "automatic",
                                  }
                                : row,
                            ),
                          );
                          setNotice(
                            "예시 캠페인의 지급 방식을 변경했습니다. 진행 중인 실제 인터뷰의 정책은 변경되지 않습니다.",
                          );
                        }}
                      >
                        <option value="manual">수동 승인</option>
                        <option value="automatic">자동 지급</option>
                      </select>
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          open(c);
                          setDetail(true);
                        }}
                      >
                        상세 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-heading">
            <h2>리워드 승인</h2>
            <span className="fine">AI Judge 평가를 먼저 확인하세요</span>
          </div>
          <section className="approval-panel">
            <div>
              <span className="badge">AI JUDGE · 예시</span>
              <h3>일정 관리 서비스 사용성</h3>
              <p>
                “회의가 길어져서 다음 일정을 놓쳤어요. 일정 사이 이동 시간도
                같이 알려주면 좋겠어요.”
              </p>
              <div className="judge-chips">
                <span>구체성 2/2</span>
                <span>경험 근거 1/2</span>
                <span>관련성 2/2</span>
              </div>
            </div>
            <div className="approval-action">
              <span>최종 평가 점수</span>
              <strong>
                83<small>/100</small>
              </strong>
              <p>0.0000083 ETH</p>
              <button
                disabled={approved}
                onClick={() => {
                  setApproved(true);
                  setNotice(
                    "예시 리워드를 승인했습니다. 샘플 상태만 변경되며 실제 자산은 전송되지 않습니다.",
                  );
                }}
              >
                {approved ? "승인 완료" : "평가 확인 · 지급 승인"}
              </button>
            </div>
          </section>
        </>
      )}
      {(selected || creating) && (
        <div className="modal-backdrop">
          <section
            className="workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="dialog-close secondary"
              aria-label="닫기"
              onClick={() => {
                setSelected(null);
                setCreating(false);
              }}
            >
              ✕
            </button>
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const qs = questions
                    .split("\n")
                    .map((q) => q.trim())
                    .filter(Boolean);
                  if (!qs.length || qs.length > 5) {
                    setNotice("질문을 1–5개 입력해주세요.");
                    return;
                  }
                  setCampaigns((rows) => [
                    {
                      id: Date.now(),
                      title: name,
                      brand: "나의 리서치",
                      topic: "사용성 리서치",
                      reward: chain === "Base" ? "0.00001 ETH" : "0.001 SOL",
                      chain,
                      questions: qs,
                      target: 20,
                      done: 0,
                      mode,
                      status: "초안",
                    },
                    ...rows,
                  ]);
                  setCreating(false);
                  setNotice(
                    "예시 계정에 캠페인 초안을 만들었습니다. 실제 모집은 실제 캠페인 운영에서 시작할 수 있습니다.",
                  );
                }}
              >
                <span className="kicker">NEW CAMPAIGN</span>
                <h2 id="dialog-title">캠페인 만들기</h2>
                <label>
                  캠페인 이름
                  <input
                    autoFocus
                    required
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="어떤 경험을 듣고 싶으신가요?"
                  />
                </label>
                <label>
                  인터뷰 질문 · 한 줄에 하나
                  <textarea
                    rows={4}
                    required
                    value={questions}
                    onChange={(e) => setQuestions(e.target.value)}
                    placeholder="최근 사용한 경험을 이야기해주세요."
                  />
                </label>
                <label>
                  네트워크
                  <select
                    value={chain}
                    onChange={(e) => setChain(e.target.value)}
                  >
                    <option>Solana</option>
                    <option>Base</option>
                  </select>
                </label>
                <label>
                  지급 방식
                  <select
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as "manual" | "automatic")
                    }
                  >
                    <option value="manual">수동 · 운영자 확인 후 승인</option>
                    <option value="automatic">
                      자동 · AI Judge 평가 확정 후 지급
                    </option>
                  </select>
                </label>
                <button>캠페인 초안 만들기</button>
                <p className="fine">
                  예시 계정의 변경은 현재 화면에만 적용됩니다.
                </p>
              </form>
            ) : selected ? (
              <>
                <span className="kicker">
                  {detail ? "CAMPAIGN DETAIL" : "INTERVIEW ROOM"}
                </span>
                <h2 id="dialog-title">{selected.title}</h2>
                <div className="reward-strip">
                  <span>
                    {selected.chain} ·{" "}
                    {selected.mode === "manual" ? "수동 승인" : "자동 지급"}
                  </span>
                  <strong>{selected.reward}</strong>
                </div>
                {detail ? (
                  <>
                    <h3>인터뷰 질문</h3>
                    <ol className="question-list">
                      {selected.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                    <p>
                      {selected.done} / {selected.target}명 참여 완료
                    </p>
                    <a className="button" href="/admin">
                      실제 캠페인 운영으로 이동 ↗
                    </a>
                  </>
                ) : (
                  <>
                    <div className="sample-interviewer">
                      <div className="voice-mark" aria-hidden="true">
                        {[14, 30, 48, 34, 24].map((height, i) => (
                          <i key={i} style={{ height }} />
                        ))}
                      </div>
                      <span>AI 인터뷰어</span>
                    </div>
                    <span className="kicker">
                      QUESTION 1 / {selected.questions.length}
                    </span>
                    <h3>{selected.questions[0]}</h3>
                    <p>
                      카메라와 마이크를 준비하고, 구체적인 경험을 편하게
                      이야기해주세요.
                    </p>
                    <p className="notice">
                      예시 캠페인의 인터뷰 화면입니다. 실제 녹음·평가·리워드
                      지급은 제품팀이 발급한 초대 링크로 참여할 수 있습니다.
                    </p>
                    <button
                      onClick={() => {
                        setSelected(null);
                        setNotice(
                          "제품팀이 전달한 초대 링크를 오른쪽의 ‘받은 초대 링크로 참여’에 입력해주세요.",
                        );
                      }}
                    >
                      받은 초대 링크로 참여
                    </button>
                  </>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
