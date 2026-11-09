"use client";
import { useState } from "react";
import { api, Result, statuses, reward } from "@/components/api";
type Config = {
  openaiConfigured: boolean;
  payoutEnabled: boolean;
  baseKeyConfigured: boolean;
  solanaKeyConfigured: boolean;
};
export default function Admin() {
  const [password, setPassword] = useState(""),
    [logged, setLogged] = useState(false),
    [rows, setRows] = useState<Result[]>([]),
    [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [title, setTitle] = useState("제품 사용 경험 인터뷰"),
    [context, setContext] = useState(
      "제품을 사용하며 겪은 상황과 개선이 필요한 순간을 듣습니다.",
    ),
    [questions, setQuestions] = useState(
      "최근 이 제품을 사용한 상황을 구체적으로 말씀해주세요.\n사용 중 가장 어려웠던 점과 그 이유는 무엇인가요?\n어떤 변화가 생긴다면 다시 사용하고 싶으신가요?",
    ),
    [mode, setMode] = useState("manual");
  async function refresh() {
    setRows(await api<Result[]>("admin/interviews"));
    setConfig(await api<Config>("admin/config"));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main">
      <div className="eyebrow">RESEARCH DESK</div>
      <h1>
        질문을 준비하고,
        <br />
        경험을 살펴보세요.
      </h1>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!logged ? (
        <form
          className="panel login"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("admin/login", { token: password });
              setPassword("");
              setLogged(true);
              await refresh();
            });
          }}
        >
          <h2>운영자 로그인</h2>
          <label>
            운영자 접근 키
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button disabled={busy}>로그인 →</button>
          <p className="fine">서버에 등록한 운영자 키를 사용하세요.</p>
        </form>
      ) : (
        <>
          <div className="toolbar">
            <span className="network-tag">테스트넷 전용</span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              새로고침
            </button>
            <button
              className="text-button"
              onClick={() =>
                void run(async () => {
                  await api("admin/logout", {});
                  setLogged(false);
                  setRows([]);
                })
              }
            >
              로그아웃
            </button>
          </div>
          {config &&
            (!config.openaiConfigured ||
              !config.payoutEnabled ||
              !config.baseKeyConfigured ||
              !config.solanaKeyConfigured) && (
              <div className="notice">
                연결 준비: AI {config.openaiConfigured ? "설정됨" : "설정 필요"}{" "}
                · Base 지급 지갑{" "}
                {config.baseKeyConfigured ? "설정됨" : "설정 필요"} · Solana
                지급 지갑 {config.solanaKeyConfigured ? "설정됨" : "설정 필요"}{" "}
                · 송금 {config.payoutEnabled ? "활성" : "비활성"}
              </div>
            )}
          <div className="split admin-grid">
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const r = await api<{ url: string }>("admin/studies", {
                    title,
                    context,
                    questions: questions
                      .split("\n")
                      .map((q) => q.trim())
                      .filter(Boolean),
                    mode,
                  });
                  const inviteUrl = new URL(r.url);
                  setUrl(
                    new URL(
                      inviteUrl.pathname + inviteUrl.search,
                      window.location.origin,
                    ).toString(),
                  );
                });
              }}
            >
              <span className="kicker">NEW INTERVIEW</span>
              <h2>인터뷰 초대 만들기</h2>
              <label>
                인터뷰 제목
                <input
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  required
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
                질문 · 한 줄에 하나, 최대 5개
                <textarea
                  rows={6}
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  required
                />
              </label>
              <fieldset>
                <legend>리워드 지급 방식</legend>
                <label className="radio">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "manual"}
                    onChange={() => setMode("manual")}
                  />
                  <span>
                    <strong>수동 승인</strong>
                    <small>AI Judge 평가 후 운영자가 지급 승인</small>
                  </span>
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "automatic"}
                    onChange={() => setMode("automatic")}
                  />
                  <span>
                    <strong>자동 지급</strong>
                    <small>AI Judge 평가 확정 후 자동 송금</small>
                  </span>
                </label>
              </fieldset>
              <button disabled={busy}>1회용 초대 링크 생성 →</button>
              {url && (
                <div className="notice">
                  <p className="break">{url}</p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(url);
                      })
                    }
                  >
                    초대 링크 복사
                  </button>
                  <a href={url} target="_blank" rel="noreferrer">
                    참여 화면 열기 ↗
                  </a>
                </div>
              )}
            </form>
            <section>
              <div className="section-heading">
                <h2>인터뷰 · 지급 내역</h2>
                <span>{rows.length}건</span>
              </div>
              {rows.length === 0 ? (
                <div className="panel empty">
                  <h3>아직 참여한 인터뷰가 없어요</h3>
                  <p>초대 링크를 참여자에게 전달해주세요.</p>
                </div>
              ) : (
                rows.map((r) => (
                  <article className="panel interview-row" key={r.id}>
                    <span className="kicker">
                      {r.mode === "manual" ? "수동 승인" : "자동 지급"} ·{" "}
                      {r.chain === "base" ? "Base Sepolia" : "Solana Devnet"}
                    </span>
                    <h3>{r.title}</h3>
                    <p>
                      {statuses[r.status]} ·{" "}
                      {r.score === null ? "미평가" : `${r.score}점`}
                    </p>
                    <p className="fine break">{r.address}</p>
                    {r.payout && (
                      <p>
                        <strong>{reward(r.chain, r.payout.amount)}</strong> ·{" "}
                        {statuses[r.payout.status]}
                      </p>
                    )}
                    {r.error && <p className="notice">{r.error}</p>}
                    {r.payout?.error && (
                      <p className="notice">{r.payout.error}</p>
                    )}
                    <details>
                      <summary>답변과 평가 근거 보기</summary>
                      {r.turns.map((t) => (
                        <div key={t.id}>
                          <h4>{t.question}</h4>
                          <p>{t.answer}</p>
                        </div>
                      ))}
                      {r.evaluation?.items.map((i) => (
                        <p key={i.question_id + i.criterion}>
                          <strong>
                            Q{Number(i.question_id) + 1} · {i.criterion}{" "}
                            {i.score}/2
                          </strong>
                          <br />
                          {i.reason}
                          <br />
                          {i.evidence}
                        </p>
                      ))}
                    </details>
                    {r.payout?.status === "awaiting_approval" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm("표시된 테스트 리워드 지급을 승인할까요?")
                          )
                            void run(async () => {
                              await api(`admin/payouts/${r.id}/approve`, {});
                              await refresh();
                            });
                        }}
                      >
                        평가 확인 · 지급 승인
                      </button>
                    )}
                    {r.status === "review_required" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`admin/interviews/${r.id}/rejudge`, {});
                            await refresh();
                          })
                        }
                      >
                        AI Judge 재평가
                      </button>
                    )}
                    {r.payout?.url && (
                      <a href={r.payout.url} target="_blank" rel="noreferrer">
                        거래 확인 ↗
                      </a>
                    )}
                  </article>
                ))
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
