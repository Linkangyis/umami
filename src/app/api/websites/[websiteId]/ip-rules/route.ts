import { z } from 'zod';
import { createIpRuleSchema, MAX_IP_RULES } from '@/lib/ip-rules';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import {
  createIpRule,
  getWebsiteIpRules,
  IpRuleLimitError,
  IpRuleWebsiteNotFoundError,
} from '@/queries/prisma/ipRule';

type Context = { params: Promise<{ websiteId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const { websiteId } = await params;
  if (!z.uuid().safeParse(websiteId).success) return badRequest();
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) return unauthorized();
  return Response.json(
    {
      data: await getWebsiteIpRules(websiteId),
      canEdit: !!(await canUpdateWebsite(auth, websiteId)),
      limit: MAX_IP_RULES,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request, { params }: Context) {
  const { auth, body, error } = await parseRequest(request, createIpRuleSchema);
  if (error) return error();
  const { websiteId } = await params;
  if (!z.uuid().safeParse(websiteId).success) return badRequest();
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  try {
    return json(await createIpRule(websiteId, body));
  } catch (error) {
    if (error instanceof IpRuleLimitError) return badRequest({ code: 'ip-rule-limit' });
    if (error instanceof IpRuleWebsiteNotFoundError) return notFound();
    if ((error as { code?: string })?.code === 'P2002')
      return badRequest({ code: 'ip-rule-duplicate' });
    throw error;
  }
}
