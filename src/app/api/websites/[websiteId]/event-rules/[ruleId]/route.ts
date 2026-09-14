import { z } from 'zod';
import { updateEventRuleSchema } from '@/lib/event-rules';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { deleteEventRule, updateEventRule } from '@/queries/prisma/eventRule';

type Context = { params: Promise<{ websiteId: string; ruleId: string }> };
const ids = z.object({ websiteId: z.uuid(), ruleId: z.uuid() });

export async function PUT(request: Request, { params }: Context) {
  const { auth, body, error } = await parseRequest(request, updateEventRuleSchema);
  if (error) return error();
  const values = ids.safeParse(await params);
  if (!values.success) return badRequest();
  const { websiteId, ruleId } = values.data;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  const result = await updateEventRule(websiteId, ruleId, body);
  return result ? json(result) : notFound();
}

export async function DELETE(request: Request, { params }: Context) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const values = ids.safeParse(await params);
  if (!values.success) return badRequest();
  const { websiteId, ruleId } = values.data;
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  const result = await deleteEventRule(websiteId, ruleId);
  return result.count ? ok() : notFound();
}
