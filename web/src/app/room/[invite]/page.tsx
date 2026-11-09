import Interview from "@/components/Interview";
export default async function Room({
  params,
}: {
  params: Promise<{ invite: string }>;
}) {
  const { invite } = await params;
  return <Interview initialToken={invite} />;
}
