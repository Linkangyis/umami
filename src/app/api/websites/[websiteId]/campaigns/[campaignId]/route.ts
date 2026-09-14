import { z } from 'zod';
import { campaignError, campaignRequest } from '@/lib/campaign-access';
import { campaignLinkUpdateSchema } from '@/lib/campaigns';
import { badRequest, json, notFound } from '@/lib/response';
import { deleteCampaignLink, updateCampaignLink } from '@/queries/prisma/campaigns';

type Context = { params: Promise<{ websiteId: string; campaignId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { websiteId, campaignId } = await params;
  const result = await campaignRequest(request, websiteId, campaignLinkUpdateSchema, true);
  if (result.error) return result.error;
  if (!z.uuid().safeParse(campaignId).success) return badRequest();
  try {
    const link = await updateCampaignLink(websiteId, campaignId, result.body);
    return link ? json(link) : notFound();
  } catch (error) {
    return campaignError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { websiteId, campaignId } = await params;
  const result = await campaignRequest(request, websiteId, undefined, true);
  if (result.error) return result.error;
  if (!z.uuid().safeParse(campaignId).success) return badRequest();
  const deleted = await deleteCampaignLink(websiteId, campaignId);
  return deleted.count ? json({ deleted: true }) : notFound();
}
