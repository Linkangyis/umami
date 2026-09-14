import { z } from 'zod';
import { updateIpRuleSchema } from '@/lib/ip-rules';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { deleteIpRule, updateIpRule } from '@/queries/prisma/ipRule';

type Context = { params: Promise<{ websiteId: string; ruleId: string }> };
const ids = z.object({ websiteId: z.uuid(), ruleId: z.uuid() });

export async function PUT(request: Request, { params }: Context) {
  const { auth, body, error } = await parseRequest(request, updateIpRuleSchema);
  if (error) return error();
  const values = ids.safeParse(await params);
  if (!values.success) return badRequest();
  const { websiteId, ruleId } = values.data;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  try {
    const result = await updateIpRule(websiteId, ruleId, body);
    return result ? json(result) : notFound();
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002')
      return badRequest({ code: 'ip-rule-duplicate' });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const values = ids.safeParse(await params);
  if (!values.success) return badRequest();
  const { websiteId, ruleId } = values.data;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  return (await deleteIpRule(websiteId, ruleId)).count ? ok() : notFound();
}
