import { z } from 'zod';
import { campaignError, campaignRequest } from '@/lib/campaign-access';
import { campaignParameterUpdateSchema } from '@/lib/campaigns';
import { badRequest, json, notFound } from '@/lib/response';
import { deleteCampaignParameter, updateCampaignParameter } from '@/queries/prisma/campaigns';

type Context = { params: Promise<{ websiteId: string; parameterId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { websiteId, parameterId } = await params;
  const result = await campaignRequest(request, websiteId, campaignParameterUpdateSchema, true);
  if (result.error) return result.error;
  if (!z.uuid().safeParse(parameterId).success) return badRequest();
  try {
    const parameter = await updateCampaignParameter(websiteId, parameterId, result.body);
    return parameter ? json(parameter) : notFound();
  } catch (error) {
    return campaignError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { websiteId, parameterId } = await params;
  const result = await campaignRequest(request, websiteId, undefined, true);
  if (result.error) return result.error;
  if (!z.uuid().safeParse(parameterId).success) return badRequest();
  const deleted = await deleteCampaignParameter(websiteId, parameterId);
  return deleted.count ? json({ deleted: true }) : notFound();
}
