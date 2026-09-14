import { campaignError, campaignRequest } from '@/lib/campaign-access';
import { campaignParameterSchema, MAX_CAMPAIGN_PARAMETERS } from '@/lib/campaigns';
import { json } from '@/lib/response';
import { getCampaignParameters, saveCampaignParameter } from '@/queries/prisma/campaigns';

type Context = { params: Promise<{ websiteId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { websiteId } = await params;
  const result = await campaignRequest(request, websiteId);
  if (result.error) return result.error;
  const data = await getCampaignParameters(websiteId);
  return json({
    data,
    count: data.length,
    limit: MAX_CAMPAIGN_PARAMETERS,
    canEdit: result.canEdit,
  });
}

export async function POST(request: Request, { params }: Context) {
  const { websiteId } = await params;
  const result = await campaignRequest(request, websiteId, campaignParameterSchema, true);
  if (result.error) return result.error;
  try {
    return json(await saveCampaignParameter(websiteId, result.body));
  } catch (error) {
    return campaignError(error);
  }
}
