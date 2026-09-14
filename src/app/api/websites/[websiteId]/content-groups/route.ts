import { contentGroupSchema } from '@/lib/content-report';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsiteSection } from '@/permissions';
import {
  ContentGroupLimitError,
  ContentGroupWebsiteNotFoundError,
  createContentGroup,
  getContentGroups,
} from '@/queries/prisma/content-group';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  const { websiteId } = await params;
  if (!(await canViewWebsiteSection(auth, websiteId, 'overview'))) return unauthorized();
  return json({
    data: await getContentGroups(websiteId),
    canManage: !!auth?.user && !auth?.shareToken && !!(await canUpdateWebsite(auth, websiteId)),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, contentGroupSchema);
  if (error) return error();
  const { websiteId } = await params;
  if (!auth?.user || auth?.shareToken || !(await canUpdateWebsite(auth, websiteId)))
    return unauthorized();
  try {
    return json(await createContentGroup(websiteId, body));
  } catch (error) {
    if (error instanceof ContentGroupLimitError)
      return badRequest({ message: 'A website can have at most 100 content groups.' });
    if (error instanceof ContentGroupWebsiteNotFoundError) return notFound();
    throw error;
  }
}
