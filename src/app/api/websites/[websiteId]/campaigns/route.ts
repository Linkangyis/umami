import { campaignError, campaignRequest } from '@/lib/campaign-access';
import { campaignLinkSchema, MAX_CAMPAIGN_LINKS } from '@/lib/campaigns';
import { json } from '@/lib/response';
import { createCampaignLink, getCampaignLinks } from '@/queries/prisma/campaigns';

type Context = { params: Promise<{ websiteId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { websiteId } = await params;
  const result = await campaignRequest(request, websiteId);
  if (result.error) return result.error;
  const data = await getCampaignLinks(websiteId);
  return json({ data, count: data.length, limit: MAX_CAMPAIGN_LINKS, canEdit: result.canEdit });
}

export async function POST(request: Request, { params }: Context) {
  const { websiteId } = await params;
  const result = await campaignRequest(request, websiteId, campaignLinkSchema, true);
  if (result.error) return result.error;
  try {
    return json(await createCampaignLink(websiteId, result.body));
  } catch (error) {
    return campaignError(error);
  }
}
