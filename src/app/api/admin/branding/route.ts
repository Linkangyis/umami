import { brandingSchema } from '@/lib/branding';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { getAppBranding, resetAppBranding, saveAppBranding } from '@/queries/prisma/branding';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();
  return json(await getAppBranding());
}

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, brandingSchema);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();
  return json(await saveAppBranding(body));
}

export async function DELETE(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth?.user?.isAdmin) return unauthorized();
  return json(await resetAppBranding());
}
