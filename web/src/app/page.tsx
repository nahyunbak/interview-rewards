import Dashboard from "@/components/Dashboard";
import Interview from "@/components/Interview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; interview?: string; mode?: string }>;
}) {
  const params = await searchParams;
  return params.invite || params.interview ? (
    <Interview
      initialToken={params.invite || ""}
      initialId={params.interview}
    />
  ) : (
    <Dashboard
      initialTab={params.mode === "campaign" ? "campaign" : "participant"}
    />
  );
}
