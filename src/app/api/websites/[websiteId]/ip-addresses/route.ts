import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getIpAnalytics } from '@/queries/sql/reports/getIpAnalytics';

const schema = withDateRange({
  ...filterParams,
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(25),
  search: z.string().trim().max(100).optional(),
  orderBy: z.enum(['pageviews', 'visitors', 'visits', 'lastSeen', 'ip']).default('pageviews'),
  descending: z.enum(['true', 'false']).default('true'),
}).superRefine((value, context) => {
  const start = value.startAt ?? value.startDate?.getTime();
  const end = value.endAt ?? value.endDate?.getTime();
  if (
    start != null &&
    end != null &&
    (!Number.isFinite(new Date(start).getTime()) ||
      !Number.isFinite(new Date(end).getTime()) ||
      end < start)
  ) {
    context.addIssue({ code: 'custom', message: 'Invalid date range' });
  }
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();
  const { websiteId } = await params;
  if (!z.uuid().safeParse(websiteId).success) return badRequest();
  // Raw IP reports are never available through share links, even when sessions are shared.
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) return unauthorized();
  const filters = await getQueryFilters(
    {
      ...query,
      startAt: query.startAt ?? query.startDate?.getTime(),
      endAt: query.endAt ?? query.endDate?.getTime(),
    },
    websiteId,
  );
  return Response.json(
    await getIpAnalytics(websiteId, filters, {
      ...query,
      descending: query.descending !== 'false',
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
