"use client";
import { useEffect, useRef, useState } from "react";
import { api, Result, statuses, reward } from "@/components/api";
import { connectWallet } from "@/components/wallet";
type Invite = {
  title: string;
  context: string;
  questionCount: number;
  mode: string;
  rewards: Record<string, string>;
  aiReady: boolean;
};
export default function Interview({ initialToken }: { initialToken: string }) {
  const [invite, setInvite] = useState<Invite | null>(null),
    [inviteToken, setInviteToken] = useState(initialToken),
    [chain, setChain] = useState("base"),
    [wallet, setWallet] = useState("metamask"),
    [consent, setConsent] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [question, setQuestion] = useState(""),
    [preview, setPreview] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const t = initialToken;
    if (t)
      api<Invite>(`invites/${encodeURIComponent(t)}`)
        .then((data) => {
          setInviteToken(t);
          setInvite(data);
        })
        .catch((e) => {
          setInviteToken(t);
          setError(e.message);
        });
    const id = sessionStorage.getItem("interviewId:" + t);
    if (id)
      api<Result>(`interviews/${id}`)
        .then(setResult)
        .catch(() => sessionStorage.removeItem("interviewId:" + t));
    return () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
    };
  }, [initialToken]);
  useEffect(() => {
    if (video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [preview, result?.status]);
  useEffect(() => {
    if (
      !result ||
      !["evaluating", "completed", "review_required"].includes(result.status)
    )
      return;
    const id = result.id;
    const timer = setInterval(
      () =>
        api<Result>(`interviews/${id}`)
          .then(setResult)
          .catch(() => setError("상태 갱신에 실패했습니다. 새로고침해주세요.")),
      5000,
    );
    return () => clearInterval(timer);
  }, [result?.id, result?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function device() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setPreview(true);
  }
  async function connect() {
    const w = await connectWallet(chain, wallet);
    const c = await api<{ id: string; message: string }>("auth/challenge", {
      invite: inviteToken,
      chain,
      address: w.address,
    });
    const signed = await w.sign(c.message);
    const session = await api<{ id: string }>("auth/verify", {
      id: c.id,
      signature: signed,
      provider: wallet,
      consent,
    });
    sessionStorage.setItem("interviewId:" + inviteToken, session.id);
    setResult(await api<Result>(`interviews/${session.id}`));
  }
  async function ask(id: string) {
    const q = await api<{ question: string | null }>(
      `interviews/${id}/question`,
      {},
    );
    setQuestion(q.question || "모든 질문에 답변했습니다.");
  }
  async function begin() {
    if (!result) return;
    if (!stream.current) await device();
    const r = await api<Result>(`interviews/${result.id}/start`, {});
    setResult(r);
    await ask(r.id);
  }
  async function voice() {
    if (!result) return;
    const r = await fetch(`/api/interviews/${result.id}/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok)
      throw new Error(
        "질문 음성을 재생하지 못했습니다. 화면의 질문을 읽고 답변할 수 있습니다.",
      );
    const url = URL.createObjectURL(await r.blob());
    audio.current?.pause();
    audio.current = new Audio(url);
    audio.current.onended = () => URL.revokeObjectURL(url);
    await audio.current.play();
  }
  async function record() {
    if (!result) return;
    if (!stream.current) await device();
    audio.current?.pause();
    const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/mp4";
    const media = new MediaStream(stream.current!.getAudioTracks());
    const rec = new MediaRecorder(media, { mimeType: type });
    recorder.current = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      setRecording(false);
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      void task(async () => {
        const blob = new Blob(chunks, { type });
        if (blob.size > 10 * 1024 * 1024)
          throw new Error("답변이 너무 깁니다. 3분 이내로 다시 녹음해주세요.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] || "");
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await api(`interviews/${result.id}/answer`, {
          audio: data,
          type,
          index: result.turns.length,
        });
        setResult(await api<Result>(`interviews/${result.id}`));
        await ask(result.id);
      });
    };
    rec.start();
    setRecording(true);
    recordingTimer.current = setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, 180000);
  }
  async function finish() {
    if (!result) return;
    await api(`interviews/${result.id}/finish`, {});
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setPreview(false);
    setResult(await api<Result>(`interviews/${result.id}`));
  }
  const isInterview = result?.status === "in_progress";
  const isResult =
    !!result && !["ready", "in_progress"].includes(result.status);
  return (
    <main id="main">
      <div className="eyebrow">
        <span className="dot" /> 당신의 경험이 제품의 다음을 만듭니다
      </div>
      <div className="heading-row">
        <h1>
          {isResult
            ? "경험의 가치를\n확인해보세요."
            : isInterview
              ? "편하게,\n당신의 이야기로."
              : "좋은 질문에,\n당신만의 경험을."}
        </h1>
        <p className="intro">
          AI와 이야기하고, 답변의 가치를 확인하세요.
          <br />
          리워드는 선택한 지갑으로 전달됩니다.
        </p>
      </div>
      <ol className="steps">
        <li className={!result || result.status === "ready" ? "active" : ""}>
          01 <span>참여 준비</span>
        </li>
        <li className={isInterview ? "active" : ""}>
          02 <span>AI 인터뷰</span>
        </li>
        <li className={isResult ? "active" : ""}>
          03 <span>평가 · 리워드</span>
        </li>
      </ol>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!invite && !result ? (
        <section className="empty">
          <div className="voice-mark" aria-hidden="true">
            {[24, 48, 80, 56, 104, 72, 40, 64, 28].map((h, i) => (
              <i key={i} style={{ height: h }} />
            ))}
          </div>
          <h2>
            {inviteToken
              ? "초대를 확인하고 있습니다"
              : "초대 링크로 시작하세요"}
          </h2>
          <p>
            제품팀에게 받은 인터뷰 초대 링크를 열어주세요.
            <br />
            리서치를 준비한다면 관리 화면에서 질문과 지급 방식을 설정할 수
            있습니다.
          </p>
          <a className="button" href="/admin">
            리서치 관리 ↗
          </a>
          <p className="fine">테스트넷 리워드는 실제 금전 가치가 없습니다.</p>
        </section>
      ) : null}
      {(!result || result.status === "ready") && invite ? (
        <div className="split">
          <section className="panel brief">
            <span className="kicker">INTERVIEW BRIEF</span>
            <h2>{invite.title}</h2>
            <p>{invite.context}</p>
            <div className="facts">
              <div>
                <small>질문</small>
                <strong>{invite.questionCount}개</strong>
              </div>
              <div>
                <small>지급 방식</small>
                <strong>
                  {invite.mode === "manual" ? "운영자 승인" : "자동 지급"}
                </strong>
              </div>
            </div>
            <h3>어떤 답변을 듣고 싶나요?</h3>
            <ul>
              <li>직접 겪은 상황과 구체적인 경험</li>
              <li>선택한 이유와 어려웠던 순간</li>
              <li>질문에 관련된 솔직한 의견</li>
            </ul>
            <p className="fine">
              말의 길이·표정·칭찬 여부는 평가하지 않습니다.
            </p>
          </section>
          <section className="panel">
            <span className="kicker">YOUR REWARD WALLET</span>
            <h2>리워드를 받을 곳</h2>
            <label>
              네트워크
              <select
                value={chain}
                disabled={!!result}
                onChange={(e) => setChain(e.target.value)}
              >
                <option value="base">Base Sepolia</option>
                <option value="solana">Solana Devnet</option>
              </select>
            </label>
            <label>
              지갑
              <select
                value={wallet}
                disabled={!!result}
                onChange={(e) => setWallet(e.target.value)}
              >
                <option value="metamask">MetaMask</option>
                <option value="phantom">Phantom</option>
              </select>
            </label>
            <div className="reward-strip">
              <span>최대 테스트 리워드</span>
              <strong>{reward(chain, invite.rewards[chain] || "0")}</strong>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                disabled={!!result}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                음성의 OpenAI 전송·전사와 AI 평가에 동의합니다. 영상은 서버에
                저장하지 않습니다. 전사는 30일 후 삭제되며 결과에서 삭제를
                요청할 수 있습니다.
              </span>
            </label>
            {preview ? (
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                className="preview"
                aria-label="카메라 미리보기"
              />
            ) : null}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void task(device)}
            >
              카메라 · 마이크 확인
            </button>
            {!result ? (
              <button
                disabled={busy || !consent || !invite.aiReady}
                onClick={() => void task(connect)}
              >
                {busy ? "연결 중…" : "지갑 연결하고 주소 확인 →"}
              </button>
            ) : (
              <>
                <p className="fine break">연결됨 · {result.address}</p>
                <button disabled={busy} onClick={() => void task(begin)}>
                  인터뷰 시작 →
                </button>
              </>
            )}
            {!invite.aiReady && (
              <p className="notice">운영자가 AI 연결을 준비 중입니다.</p>
            )}
            <p className="fine">
              수령 주소는 참여 후 바꿀 수 없습니다. 시드 문구나 송금 승인을
              요청하지 않습니다.
            </p>
          </section>
        </div>
      ) : null}
      {isInterview && result ? (
        <div className="split">
          <section className="camera">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="내 카메라"
            />
            <div className="camera-label">
              <span className="dot" />{" "}
              {preview
                ? "카메라 미리보기 · 영상 저장 안 함"
                : "카메라를 연결해주세요"}
            </div>
            <button
              className="secondary"
              disabled={busy || recording}
              onClick={() => void task(device)}
            >
              카메라 다시 연결
            </button>
          </section>
          <section className="panel">
            <span className="kicker">
              QUESTION{" "}
              {Math.min(result.turns.length + 1, result.questions.length)} /{" "}
              {result.questions.length}
            </span>
            <h2>
              {question ||
                result.currentQuestion ||
                result.questions[result.turns.length] ||
                "모든 답변이 준비됐어요."}
            </h2>
            <p>직접 겪은 상황과 이유를 함께 이야기해주세요.</p>
            {result.turns.length < result.questions.length ? (
              <>
                <button
                  className="secondary"
                  disabled={busy || recording}
                  onClick={() => void task(voice)}
                >
                  질문 음성 듣기
                </button>
                <button
                  className={recording ? "recording" : ""}
                  disabled={busy}
                  onClick={() =>
                    recording ? recorder.current?.stop() : void task(record)
                  }
                >
                  {recording
                    ? "■ 답변 마치기"
                    : busy
                      ? "답변 처리 중…"
                      : "● 음성으로 답변하기"}
                </button>
                <p className="fine">
                  한 답변은 최대 3분입니다. 답변 마치기를 누르면 전사합니다.
                </p>
              </>
            ) : (
              <button disabled={busy} onClick={() => void task(finish)}>
                인터뷰 마치고 평가받기 →
              </button>
            )}
            <button
              className="text-button"
              disabled={busy || recording}
              onClick={() => {
                if (
                  confirm(
                    "중단하면 리워드를 받을 수 없습니다. 인터뷰를 중단할까요?",
                  )
                )
                  void task(async () => {
                    await api(`interviews/${result.id}/cancel`, {});
                    stream.current?.getTracks().forEach((t) => t.stop());
                    setResult(await api<Result>(`interviews/${result.id}`));
                  });
              }}
            >
              인터뷰 중단
            </button>
            {result.turns.map((t) => (
              <details key={t.id}>
                <summary>질문 {Number(t.id) + 1} · 내 답변</summary>
                <p>{t.answer}</p>
              </details>
            ))}
          </section>
        </div>
      ) : null}
      {isResult && result ? (
        <section className="panel result">
          <div className="result-top">
            <div>
              <span className="kicker">AI JUDGE</span>
              <h2>{statuses[result.status] || result.status}</h2>
              <p>
                {result.error ||
                  "구체성 · 경험의 근거 · 질문 관련성으로 평가합니다."}
              </p>
            </div>
            <div className="score">
              {result.score ?? "—"}
              <small>/ 100</small>
            </div>
          </div>
          {result.payout ? (
            <div className="reward-strip">
              <div>
                <small>{statuses[result.payout.status]}</small>
                <strong>{reward(result.chain, result.payout.amount)}</strong>
              </div>
              <span>
                {result.chain === "base" ? "Base Sepolia" : "Solana Devnet"}
              </span>
            </div>
          ) : null}
          {result.payout?.error && (
            <p className="notice">{result.payout.error}</p>
          )}
          <p className="fine break">수령 주소 · {result.address}</p>
          {result.payout?.url && (
            <a
              href={result.payout.url}
              target="_blank"
              rel="noreferrer"
              className="button secondary"
            >
              블록체인 거래 확인 ↗
            </a>
          )}
          <div className="evaluation">
            {result.evaluation?.items.map((i) => (
              <article key={i.question_id + i.criterion}>
                <span className="kicker">
                  Q{Number(i.question_id) + 1} ·{" "}
                  {
                    (
                      {
                        specificity: "구체성",
                        evidence: "경험의 근거",
                        relevance: "질문 관련성",
                      } as Record<string, string>
                    )[i.criterion]
                  }
                </span>
                <h3>{i.score} / 2</h3>
                <p>{i.reason}</p>
                {i.evidence && <blockquote>“{i.evidence}”</blockquote>}
              </article>
            ))}
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void task(async () =>
                setResult(await api<Result>(`interviews/${result.id}`)),
              )
            }
          >
            상태 새로고침
          </button>
          <p className="fine">
            평가에 이의가 있다면 초대를 보낸 제품팀에 인터뷰 ID {result.id}를
            알려주세요.
          </p>
          {["completed", "cancelled"].includes(result.status) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "전사와 평가 근거를 삭제할까요? 지급 기록과 블록체인 거래는 남습니다.",
                  )
                )
                  void task(async () => {
                    await api(
                      `interviews/${result.id}/data`,
                      undefined,
                      "DELETE",
                    );
                    setResult(await api<Result>(`interviews/${result.id}`));
                  });
              }}
            >
              내 전사·평가 근거 삭제
            </button>
          )}
        </section>
      ) : null}
    </main>
  );
}
