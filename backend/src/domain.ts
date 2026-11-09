import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
export type Chain = "base" | "solana";
export type Mode = "manual" | "automatic";
export type Turn = { id: string; question: string; answer: string };
export type Snapshot = {
  title: string;
  context: string;
  questions: string[];
  maxAmount: string;
  judgeModel: string;
};
export type Evaluation = {
  items: {
    question_id: string;
    criterion: string;
    score: number;
    reason: string;
    evidence: string;
  }[];
  needs_review: boolean;
  review_reason: string;
};
export const criteria = ["specificity", "evidence", "relevance"];
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export function equal(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function validateEvaluation(value: unknown, turns: Turn[]): Evaluation {
  if (!value || typeof value !== "object") throw new Error("평가 형식 오류");
  const e = value as Evaluation;
  if (
    !Array.isArray(e.items) ||
    typeof e.needs_review !== "boolean" ||
    typeof e.review_reason !== "string"
  )
    throw new Error("평가 형식 오류");
  if (e.items.length !== turns.length * criteria.length)
    throw new Error("평가 항목 누락");
  const seen = new Set<string>();
  for (const i of e.items) {
    const t = turns.find((t) => t.id === i.question_id);
    const key = `${i.question_id}:${i.criterion}`;
    if (
      !t ||
      seen.has(key) ||
      !criteria.includes(i.criterion) ||
      !Number.isInteger(i.score) ||
      i.score < 0 ||
      i.score > 2 ||
      typeof i.reason !== "string" ||
      !i.reason.trim() ||
      typeof i.evidence !== "string" ||
      (i.score > 0 && (!i.evidence.trim() || !t.answer.includes(i.evidence)))
    )
      throw new Error("평가 근거 또는 점수 오류");
    seen.add(key);
  }
  return e;
}
export function score(e: Evaluation) {
  return Math.round(
    (e.items.reduce((n, i) => n + i.score, 0) / (e.items.length * 2)) * 100,
  );
}
export function amount(e: Evaluation, max: string) {
  return ((BigInt(max) * BigInt(score(e))) / 100n).toString();
}
export function payoutStatus(mode: Mode, reward: string) {
  return reward === "0"
    ? "not_payable"
    : mode === "manual"
      ? "awaiting_approval"
      : "queued";
}
export function parseStudy(body: Record<string, unknown>) {
  const { title, context, questions, mode } = body;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 120 ||
    typeof context !== "string" ||
    context.length > 4000 ||
    !Array.isArray(questions) ||
    questions.length < 1 ||
    questions.length > 5 ||
    questions.some(
      (q) => typeof q !== "string" || !q.trim() || q.length > 500,
    ) ||
    !["manual", "automatic"].includes(String(mode))
  )
    throw new Error("제목, 배경, 질문 1–5개, 지급 모드를 확인하세요.");
  return {
    title: title.trim(),
    context,
    questions: JSON.stringify(questions),
    mode: mode as Mode,
  };
}
