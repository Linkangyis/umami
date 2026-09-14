import { z } from 'zod';
import { CONTENT_MODES, CONTENT_SORT_FIELDS } from '@/lib/content-report';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, timezoneParam } from '@/lib/schema';
import { canUpdateWebsite, canViewWebsiteSection } from '@/permissions';
import { getContentGroups } from '@/queries/prisma/content-group';
import { getContentReport } from '@/queries/sql/reports/getContentReport';

export const contentReportSchema = z
  .object({
    ...filterParams,
    startAt: z.coerce.number().finite(),
    endAt: z.coerce.number().finite(),
    timezone: timezoneParam.default('UTC'),
    mode: z.enum(CONTENT_MODES).default('fullUrl'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().max(1500).default(''),
    orderBy: z.enum(CONTENT_SORT_FIELDS).default('pageviews'),
    sortDescending: z.enum(['true', 'false']).default('true'),
    detail: z.string().max(2200).optional(),
  })
  .refine(
    data =>
      Number.isFinite(+new Date(data.startAt)) &&
      Number.isFinite(+new Date(data.endAt)) &&
      data.startAt <= data.endAt,
    'Invalid date range',
  );

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, contentReportSchema);
  if (error) return error();
  const { websiteId } = await params;
  if (!(await canViewWebsiteSection(auth, websiteId, 'overview'))) return unauthorized();
  const filters = await getQueryFilters(query, websiteId);
  const groups = query.mode === 'group' ? await getContentGroups(websiteId) : [];
  const report = await getContentReport(websiteId, filters, {
    ...query,
    sortDescending: query.sortDescending === 'true',
    groups,
  });
  return json({
    ...report,
    canManageGroups:
      !!auth?.user && !auth?.shareToken && !!(await canUpdateWebsite(auth, websiteId)),
  });
}
