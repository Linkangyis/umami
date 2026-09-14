import { z } from 'zod';
import { createEventRuleSchema, MAX_EVENT_RULES } from '@/lib/event-rules';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import {
  createEventRule,
  EventRuleLimitError,
  EventRuleWebsiteNotFoundError,
  getWebsiteEventRules,
} from '@/queries/prisma/eventRule';

type Context = { params: Promise<{ websiteId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const { websiteId } = await params;
  if (!z.uuid().safeParse(websiteId).success) return badRequest();
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) return unauthorized();
  const data = await getWebsiteEventRules(websiteId);
  return json({ data, count: data.length, limit: MAX_EVENT_RULES });
}

export async function POST(request: Request, { params }: Context) {
  const { auth, body, error } = await parseRequest(request, createEventRuleSchema);
  if (error) return error();
  const { websiteId } = await params;
  if (!z.uuid().safeParse(websiteId).success) return badRequest();
  if (!(await canUpdateWebsite(auth, websiteId))) return unauthorized();
  try {
    return json(await createEventRule(websiteId, body));
  } catch (error) {
    if (error instanceof EventRuleLimitError)
      return badRequest({ message: error.message, code: 'event-rule-limit' });
    if (error instanceof EventRuleWebsiteNotFoundError) return notFound();
    throw error;
  }
}
