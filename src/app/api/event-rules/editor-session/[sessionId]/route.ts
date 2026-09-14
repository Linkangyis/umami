import { z } from 'zod';
import { corsPreflight, withCorsHeaders } from '@/lib/cors';
import { getEditorSession } from '@/lib/event-editor-sessions';
import { createEventRuleSchema } from '@/lib/event-rules';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound } from '@/lib/response';
import {
  createEventRule,
  EventRuleLimitError,
  EventRuleWebsiteNotFoundError,
  getWebsiteEventRules,
} from '@/queries/prisma/eventRule';

type Context = { params: Promise<{ sessionId: string }> };
const idSchema = z.string().regex(/^[a-f0-9]{48}$/);

export function OPTIONS() {
  return corsPreflight();
}

const reply = (response: Response) => withCorsHeaders(response, { 'Cache-Control': 'no-store' });

function sessionFrom(params: { sessionId: string }) {
  const id = idSchema.safeParse(params.sessionId);
  return id.success ? getEditorSession(id.data) : null;
}

export async function GET(_request: Request, { params }: Context) {
  const session = sessionFrom(await params);
  if (!session) return reply(notFound({ message: '编辑会话已过期，请重新打开可视化编辑器。' }));
  const data = await getWebsiteEventRules(session.websiteId);
  return reply(json({ data, count: data.length }));
}

export async function POST(request: Request, { params }: Context) {
  const session = sessionFrom(await params);
  if (!session) return reply(notFound({ message: '编辑会话已过期，请重新打开可视化编辑器。' }));
  const { body, error } = await parseRequest(request, createEventRuleSchema, { skipAuth: true });
  if (error) return reply(error());
  try {
    return reply(json(await createEventRule(session.websiteId, body)));
  } catch (error) {
    if (error instanceof EventRuleLimitError)
      return reply(badRequest({ message: error.message, code: 'event-rule-limit' }));
    if (error instanceof EventRuleWebsiteNotFoundError) return reply(notFound());
    throw error;
  }
}
