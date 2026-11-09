export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "요청을 처리하지 못했습니다.");
  return data;
}
export type Result = {
  id: string;
  title: string;
  chain: string;
  address: string;
  mode: string;
  status: string;
  questions: string[];
  currentQuestion: string | null;
  turns: { id: string; question: string; answer: string }[];
  error: string | null;
  score: number | null;
  evaluation: {
    items: {
      question_id: string;
      criterion: string;
      score: number;
      reason: string;
      evidence: string;
    }[];
  } | null;
  payout: {
    status: string;
    amount: string;
    error: string | null;
    txId: string | null;
    url: string | null;
  } | null;
};
export const statuses: Record<string, string> = {
  ready: "참여 준비",
  in_progress: "인터뷰 진행 중",
  evaluating: "AI Judge 평가 중",
  review_required: "운영자 검토 필요",
  completed: "평가 완료",
  cancelled: "인터뷰 중단",
  awaiting_approval: "운영자 승인 대기",
  queued: "지급 대기",
  submitted: "네트워크 확인 중",
  confirmed: "지급 완료",
  failed: "거래 실패",
  not_payable: "지급액 없음",
};
export function reward(chain: string, value: string) {
  const decimals = chain === "base" ? 18 : 9;
  const digits = value.padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals).replace(/0+$/, "") || "0"} ${chain === "base" ? "ETH" : "SOL"}`;
}
