import { z } from 'zod';
import { createEditorSession } from '@/lib/event-editor-sessions';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';

const schema = z.object({ websiteId: z.uuid() });

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!(await canUpdateWebsite(auth, body.websiteId))) return unauthorized();
  return json(createEditorSession(body.websiteId));
}
