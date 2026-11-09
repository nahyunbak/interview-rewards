import Dashboard from "@/components/Dashboard";
import Interview from "@/components/Interview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  return params.invite ? (
    <Interview initialToken={params.invite} />
  ) : (
    <Dashboard />
  );
}
