import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { parseRequest } from '@/lib/request';
import { badRequest, forbidden, notFound, serverError, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import {
  CampaignDuplicateError,
  CampaignLimitError,
  CampaignWebsiteMissingError,
} from '@/queries/prisma/campaigns';
import { getWebsite } from '@/queries/prisma/website';

export async function campaignRequest(
  request: Request,
  websiteId: string,
  schema?: z.ZodType,
  write = false,
) {
  const parsed = await parseRequest(request, schema);
  if (parsed.error) return { error: parsed.error() as Response };
  if (!z.uuid().safeParse(websiteId).success) return { error: badRequest() };
  if (
    !parsed.auth?.user ||
    parsed.auth.shareToken ||
    !(await canViewAuthenticatedWebsite(parsed.auth, websiteId))
  )
    return { error: unauthorized() };
  const website = await getWebsite(websiteId);
  if (!website || website.deletedAt) return { error: notFound() };
  const canEdit =
    parsed.auth.user.role !== ROLES.viewOnly && (await canUpdateWebsite(parsed.auth, websiteId));
  if (write && !canEdit) return { error: forbidden() };
  return { body: parsed.body, canEdit };
}

export function campaignError(error: unknown) {
  if (error instanceof CampaignWebsiteMissingError) return notFound();
  if (error instanceof CampaignLimitError)
    return badRequest({ code: 'campaign-limit', message: error.message });
  if (error instanceof CampaignDuplicateError)
    return badRequest({ code: 'campaign-duplicate', message: error.message });
  if (error instanceof z.ZodError)
    return badRequest({ code: 'campaign-invalid', message: 'Invalid campaign link or parameter.' });
  return serverError('Campaign settings could not be updated.');
}
