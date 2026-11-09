"use client";
import { useEffect, useState } from "react";
import { api, Result, reward, statuses } from "./api";
type Campaign = {
  id: string;
  title: string;
  context: string;
  questions: string[];
  mode: "manual" | "automatic";
  rewards: Record<string, string>;
  done: number;
};
type Workspace = {
  name: string;
  payoutEnabled: boolean;
  campaigns: Campaign[];
  interviews: Result[];
  mine: Result[];
};
let opening: Promise<unknown> | null = null;
function openWorkspace() {
  if (!opening)
    opening = api("workspace/session", {}).finally(() => {
      opening = null;
    });
  return opening;
}
export default function Dashboard({
  initialTab = "participant",
}: {
  initialTab?: "participant" | "campaign";
}) {
  const [tab, setTab] = useState(initialTab),
    [data, setData] = useState<Workspace | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [roomLink, setRoomLink] = useState(""),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Campaign | null>(null),
    [name, setName] = useState(""),
    [context, setContext] = useState(""),
    [questions, setQuestions] = useState(""),
    [mode, setMode] = useState<"manual" | "automatic">("manual"),
    [chain, setChain] = useState("solana");
  async function refresh() {
    setData(await api<Workspace>("workspace"));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    openWorkspace()
      .then(() => api<Workspace>("workspace"))
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!creating && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".workspace-dialog");
    dialog?.querySelector<HTMLElement>("input,button")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCreating(false);
        setSelected(null);
      }
      if (e.key === "Tab" && dialog) {
        const focus = [
          ...dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,textarea,select,a[href]",
          ),
        ];
        const first = focus[0],
          last = focus.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [creating, selected]);
  function switchTab(next: "participant" | "campaign") {
    setTab(next);
    history.replaceState(
      null,
      "",
      next === "campaign" ? "/?mode=campaign" : "/",
    );
  }
  async function invite(c: Campaign, join: boolean) {
    const result = await api<{ path: string }>(
      `workspace/campaigns/${c.id}/invites`,
      {},
    );
    const url = new URL(result.path, location.origin).toString();
    if (join) location.assign(url);
    else {
      setRoomLink(url);
      setNotice(
        "참여 링크를 만들었습니다. 한 명이 참여할 수 있는 인터뷰룸입니다.",
      );
    }
  }
  const campaigns = data?.campaigns || [],
    mine = data?.mine || [],
    interviews = data?.interviews || [];
  const myScores = mine.flatMap((i) => (i.score === null ? [] : [i.score]));
  const scores = interviews.flatMap((i) => (i.score === null ? [] : [i.score]));
  const pending = interviews.filter(
    (i) => i.payout?.status === "awaiting_approval",
  );
  const earned = (network: string) =>
    mine
      .filter((i) => i.chain === network && i.payout?.status === "confirmed")
      .reduce((n, i) => n + BigInt(i.payout?.amount || 0), 0n)
      .toString();
  return (
    <main id="main" className="workspace">
      <div className="role-switchbar">
        <div className="role-switch-inner">
          <nav className="workspace-tabs" aria-label="서비스 이용 모드">
            <button
              aria-pressed={tab === "participant"}
              className={tab === "participant" ? "selected" : ""}
              onClick={() => switchTab("participant")}
            >
              인터뷰 참여자
            </button>
            <button
              aria-pressed={tab === "campaign"}
              className={tab === "campaign" ? "selected" : ""}
              onClick={() => switchTab("campaign")}
            >
              캠페인 집행
            </button>
          </nav>
          <div className="account">
            <span className="avatar">하</span>
            <strong>{data?.name || "김하늘"}</strong>
            <small>체험 계정</small>
          </div>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await openWorkspace();
                await refresh();
              })
            }
          >
            다시 연결
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {roomLink && (
        <div className="room-link-panel">
          <div>
            <span className="kicker">INTERVIEW LINK</span>
            <a href={roomLink} target="_blank" rel="noreferrer">
              {roomLink}
            </a>
          </div>
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(roomLink);
                setNotice("인터뷰 링크를 복사했습니다.");
              })
            }
          >
            링크 복사
          </button>
        </div>
      )}
      {tab === "participant" ? (
        <>
          <div className="dashboard-title">
            <div>
              <span className="kicker">MY INTERVIEWS</span>
              <h1>하늘님, 어떤 경험을 나눠볼까요?</h1>
              <p>
                캠페인을 선택하면 카메라와 마이크를 준비하는 인터뷰룸으로
                연결됩니다.
              </p>
            </div>
            <span className="badge mint">참여 가능 {campaigns.length}개</span>
          </div>
          <div className="metrics">
            <article>
              <span>참여한 인터뷰</span>
              <strong>
                {mine.length}
                <small>건</small>
              </strong>
              <p>이 계정의 실제 참여 내역</p>
            </article>
            <article>
              <span>평균 답변 점수</span>
              <strong>
                {myScores.length
                  ? Math.round(
                      myScores.reduce((a, b) => a + b, 0) / myScores.length,
                    )
                  : "—"}
                <small>/100</small>
              </strong>
              <p>AI Judge 평가 결과</p>
            </article>
            <article className="reward-metric">
              <span>지급 완료 리워드</span>
              <strong className="amount-small">
                {reward("solana", earned("solana"))}
              </strong>
              <p>{reward("base", earned("base"))}</p>
            </article>
            <article>
              <span>승인·지급 대기</span>
              <strong>
                {
                  mine.filter(
                    (i) =>
                      i.payout &&
                      ["awaiting_approval", "queued", "submitted"].includes(
                        i.payout.status,
                      ),
                  ).length
                }
                <small>건</small>
              </strong>
              <p>평가 점수에 따라 금액 결정</p>
            </article>
          </div>
          <div className="workspace-columns">
            <section>
              <div className="section-heading">
                <h2>참여 가능한 캠페인</h2>
                <span className="fine">실제 AI 인터뷰</span>
              </div>
              {!data ? (
                <div className="panel">캠페인을 불러오는 중입니다.</div>
              ) : (
                <div className="campaign-cards">
                  {campaigns.map((c) => (
                    <article className="campaign-card" key={c.id}>
                      <div className="card-top">
                        <span className="brand-icon">V</span>
                        <div>
                          <strong>나의 리서치</strong>
                          <small>
                            {c.mode === "manual"
                              ? "운영자 승인 후 지급"
                              : "평가 확정 후 자동 지급"}
                          </small>
                        </div>
                        <span className="badge">AI 인터뷰</span>
                      </div>
                      <h3>{c.title}</h3>
                      <p className="card-meta">
                        질문 {c.questions.length}개 · 약{" "}
                        {c.questions.length * 2}분
                      </p>
                      <p className="fine">{c.context}</p>
                      <div className="card-footer">
                        <div>
                          <small>최대 테스트 리워드</small>
                          <strong>
                            {reward(chain, c.rewards[chain] || "0")}
                          </strong>
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => void run(() => invite(c, true))}
                        >
                          인터뷰 입장 ↗
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <aside>
              <div className="section-heading">
                <h2>내 참여 내역</h2>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  새로고침
                </button>
              </div>
              <div className="history-panel">
                {mine.length ? (
                  mine.map((i) => (
                    <article key={i.id}>
                      <div className="history-date">
                        <span>
                          {i.chain === "base"
                            ? "Base Sepolia"
                            : "Solana Devnet"}
                        </span>
                        <span
                          className={
                            "status-badge " +
                            (i.payout?.status === "confirmed" ? "paid" : "")
                          }
                        >
                          {statuses[i.payout?.status || i.status]}
                        </span>
                      </div>
                      <h3>{i.title}</h3>
                      <div className="history-value">
                        <span>
                          답변 점수 <b>{i.score ?? "—"}</b>
                        </span>
                        <strong>
                          {i.payout
                            ? reward(i.chain, i.payout.amount)
                            : "평가 전"}
                        </strong>
                      </div>
                      <a className="text-button" href={`/?interview=${i.id}`}>
                        인터뷰 결과 보기 ↗
                      </a>
                    </article>
                  ))
                ) : (
                  <article>
                    <h3>첫 인터뷰를 시작해보세요</h3>
                    <p className="fine">
                      이야기를 마치면 답변 점수와 리워드가 여기에 표시됩니다.
                    </p>
                  </article>
                )}
              </div>
              <div className="wallet-panel">
                <span className="kicker">REWARD GUIDE</span>
                <h3>구체적인 경험에 더 큰 리워드</h3>
                <p className="fine">
                  구체성·경험 근거·질문 관련성을 평가합니다. 길게 말하거나
                  칭찬한다고 점수가 올라가지는 않습니다.
                </p>
                <label>
                  리워드 표시 네트워크
                  <select
                    value={chain}
                    onChange={(e) => setChain(e.target.value)}
                  >
                    <option value="solana">Solana Devnet</option>
                    <option value="base">Base Sepolia</option>
                  </select>
                </label>
                <p className="fine">
                  수령 네트워크와 본인 지갑은 인터뷰 입장 시 확인합니다.
                </p>
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-title">
            <div>
              <span className="kicker">CAMPAIGN WORKSPACE</span>
              <h1>캠페인 집행</h1>
              <p>
                질문을 만들고 참여 링크를 공유하세요. 답변 퀄리티에 따라
                리워드가 정산됩니다.
              </p>
            </div>
            <button
              disabled={!data || busy}
              onClick={() => {
                setName("");
                setContext("");
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
                {campaigns.length}
                <small>개</small>
              </strong>
              <p>이 계정에 저장된 캠페인</p>
            </article>
            <article>
              <span>완료된 인터뷰</span>
              <strong>
                {interviews.filter((i) => i.status === "completed").length}
                <small>건</small>
              </strong>
              <p>실제 참여 결과</p>
            </article>
            <article>
              <span>평균 답변 점수</span>
              <strong>
                {scores.length
                  ? Math.round(
                      scores.reduce((a, b) => a + b, 0) / scores.length,
                    )
                  : "—"}
                <small>/100</small>
              </strong>
              <p>AI Judge 평가 완료</p>
            </article>
            <article className="reward-metric">
              <span>지급 승인 대기</span>
              <strong>
                {pending.length}
                <small>건</small>
              </strong>
              <p>수동 지급 캠페인</p>
            </article>
          </div>
          <div className="section-heading">
            <h2>내 캠페인</h2>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              새로고침
            </button>
          </div>
          <div className="campaign-table-wrap">
            <table className="campaign-table">
              <thead>
                <tr>
                  <th>캠페인</th>
                  <th>질문</th>
                  <th>완료</th>
                  <th>지급 방식</th>
                  <th>참여 링크</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <small>{c.context}</small>
                    </td>
                    <td>{c.questions.length}개</td>
                    <td>{c.done}명</td>
                    <td>
                      <span className="badge">
                        {c.mode === "manual" ? "수동 승인" : "자동 지급"}
                      </span>
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() => void run(() => invite(c, false))}
                      >
                        링크 만들기 ↗
                      </button>
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => setSelected(c)}
                      >
                        질문 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-heading">
            <h2>AI Judge 평가 · 리워드</h2>
            <span className="fine">지급액은 평가 점수로 계산됩니다.</span>
          </div>
          {interviews.length ? (
            interviews.map((i) => (
              <section className="approval-panel" key={i.id}>
                <div>
                  <span className="badge">
                    {statuses[i.status]} ·{" "}
                    {i.chain === "base" ? "Base Sepolia" : "Solana Devnet"}
                  </span>
                  <h3>{i.title}</h3>
                  <details>
                    <summary>답변과 평가 근거 확인</summary>
                    {i.turns.map((t) => (
                      <div key={t.id}>
                        <h4>{t.question}</h4>
                        <p>{t.answer}</p>
                      </div>
                    ))}
                    {i.evaluation?.items.map((e) => (
                      <p key={e.question_id + e.criterion}>
                        <b>
                          {e.criterion} {e.score}/2
                        </b>{" "}
                        · {e.reason}
                      </p>
                    ))}
                  </details>
                  {i.error && <p className="error notice">{i.error}</p>}
                </div>
                <div className="approval-action">
                  <span>최종 평가 점수</span>
                  <strong>
                    {i.score ?? "—"}
                    <small>/100</small>
                  </strong>
                  <p>
                    {i.payout
                      ? reward(i.chain, i.payout.amount)
                      : "평가 후 계산"}
                  </p>
                  <span>{statuses[i.payout?.status || i.status]}</span>
                  {i.payout?.status === "awaiting_approval" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`workspace/interviews/${i.id}/approve`, {});
                          await refresh();
                          setNotice(
                            "지급을 승인했습니다. 체인 확정 후 지급 완료로 표시됩니다.",
                          );
                        })
                      }
                    >
                      평가 확인 · 지급 승인
                    </button>
                  )}
                  {i.payout?.url && (
                    <a href={i.payout.url} target="_blank" rel="noreferrer">
                      거래 확인 ↗
                    </a>
                  )}
                </div>
              </section>
            ))
          ) : (
            <div className="panel empty">
              <h3>첫 인터뷰 결과를 기다리고 있어요</h3>
              <p>
                참여 링크를 공유하면 답변·점수·지급액을 여기에서 확인할 수
                있습니다.
              </p>
            </div>
          )}
        </>
      )}
      {data && !data.payoutEnabled && (
        <p className="funding-note">
          테스트넷 체험 중입니다. 인터뷰·평가·지급액 계산은 동작하며, 실제
          송금은 테스트 자산 충전 후 활성화됩니다.
        </p>
      )}
      {(creating || selected) && (
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
                setCreating(false);
                setSelected(null);
              }}
            >
              ✕
            </button>
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const list = questions
                      .split("\n")
                      .map((q) => q.trim())
                      .filter(Boolean);
                    if (list.length < 1 || list.length > 5)
                      throw new Error("질문을 1–5개 입력해주세요.");
                    await api("workspace/campaigns", {
                      title: name,
                      context,
                      questions: list,
                      mode,
                    });
                    await refresh();
                    setCreating(false);
                    setNotice(
                      "캠페인을 서버에 저장했습니다. 링크 만들기로 참여자를 초대하세요.",
                    );
                  });
                }}
              >
                <span className="kicker">NEW CAMPAIGN</span>
                <h2 id="dialog-title">질문을 만들고 인터뷰를 시작하세요</h2>
                <label>
                  캠페인 이름
                  <input
                    required
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  리서치 배경
                  <textarea
                    value={context}
                    maxLength={4000}
                    onChange={(e) => setContext(e.target.value)}
                  />
                </label>
                <label>
                  인터뷰 질문 · 한 줄에 하나
                  <textarea
                    rows={4}
                    required
                    value={questions}
                    onChange={(e) => setQuestions(e.target.value)}
                    placeholder="최근 사용한 경험을 구체적으로 이야기해주세요."
                  />
                </label>
                <label>
                  지급 방식
                  <select
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as "manual" | "automatic")
                    }
                  >
                    <option value="manual">수동 · 운영자 승인 후 지급</option>
                    <option value="automatic">
                      자동 · AI Judge 평가 확정 후 지급
                    </option>
                  </select>
                </label>
                <p className="fine">
                  지급액 = 최대 리워드 × 답변 점수 ÷ 100. 최대 리워드는 테스트넷
                  운영 정책을 따릅니다.
                </p>
                <button disabled={busy}>
                  {busy ? "저장 중…" : "캠페인 저장"}
                </button>
                {error && (
                  <p className="notice error" role="alert">
                    {error}
                  </p>
                )}
              </form>
            ) : selected ? (
              <>
                <span className="kicker">CAMPAIGN DETAIL</span>
                <h2 id="dialog-title">{selected.title}</h2>
                <p>{selected.context}</p>
                <ol className="question-list">
                  {selected.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
                <div className="reward-strip">
                  <span>최대 테스트 리워드</span>
                  <strong>
                    {reward(chain, selected.rewards[chain] || "0")}
                  </strong>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await invite(selected, false);
                      setSelected(null);
                    })
                  }
                >
                  참여 링크 만들기 ↗
                </button>
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
