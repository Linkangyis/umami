import { contentGroupSchema } from '@/lib/content-report';
import { parseRequest } from '@/lib/request';
import { json, notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { deleteContentGroup, updateContentGroup } from '@/queries/prisma/content-group';

type Context = { params: Promise<{ websiteId: string; groupId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { auth, body, error } = await parseRequest(request, contentGroupSchema);
  if (error) return error();
  const { websiteId, groupId } = await params;
  if (!auth?.user || auth?.shareToken || !(await canUpdateWebsite(auth, websiteId)))
    return unauthorized();
  const updated = await updateContentGroup(websiteId, groupId, body);
  return updated ? json(updated) : notFound();
}

export const PUT = PATCH;

export async function DELETE(request: Request, { params }: Context) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const { websiteId, groupId } = await params;
  if (!auth?.user || auth?.shareToken || !(await canUpdateWebsite(auth, websiteId)))
    return unauthorized();
  const result = await deleteContentGroup(websiteId, groupId);
  return result.count ? ok() : notFound();
}
