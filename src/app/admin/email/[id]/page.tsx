import CampaignStatsClient from "./CampaignStatsClient";

export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignStatsClient campaignId={id} />;
}
