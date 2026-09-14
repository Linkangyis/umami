import { z } from 'zod';
import { corsPreflight, getApiCorsHeaders, withCorsHeaders } from '@/lib/cors';
import { getRecorderPagePath } from '@/lib/recorder';
import { parseRequest } from '@/lib/request';
import { getPublicEventRules } from '@/queries/prisma/eventRule';

const schema = z.object({
  websiteId: z.uuid(),
  url: z
    .string()
    .max(2183)
    .refine(value => !!getRecorderPagePath(value), { message: 'Invalid page URL' })
    .optional(),
});

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const { query, error } = await parseRequest(request, schema, { skipAuth: true });
  if (error) return withCorsHeaders(error());
  const rules = await getPublicEventRules(query.websiteId, query.url);
  return Response.json(
    { rules },
    {
      headers: { ...getApiCorsHeaders(), 'Cache-Control': 'public, max-age=30, must-revalidate' },
    },
  );
}
