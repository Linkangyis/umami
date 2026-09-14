import { subYears } from 'date-fns';
import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { filterParams, timezoneParam } from '@/lib/schema';
import { previousTrafficPeriod, TRAFFIC_UNITS, trafficBucketDates } from '@/lib/traffic';
import { canViewWebsiteSection } from '@/permissions';
import { getTrafficReport } from '@/queries/sql/reports/getTrafficReport';

export const trafficSchema = z
  .object({
    ...filterParams,
    startAt: z.coerce.number().finite(),
    endAt: z.coerce.number().finite(),
    unit: z.enum(TRAFFIC_UNITS).default('day'),
    timezone: timezoneParam.default('UTC'),
    visitorType: z.enum(['all', 'new', 'returning']).default('all'),
    compare: z.enum(['prev', 'yoy', 'none', 'custom']).default('prev'),
    compareStartAt: z.coerce.number().finite().optional(),
    compareEndAt: z.coerce.number().finite().optional(),
  })
  .superRefine((data, ctx) => {
    const valid = (start: number, end: number) =>
      Number.isFinite(+new Date(start)) && Number.isFinite(+new Date(end)) && start <= end;
    if (!valid(data.startAt, data.endAt)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid date range' });
    }
    if (
      data.compare === 'custom' &&
      (data.compareStartAt === undefined ||
        data.compareEndAt === undefined ||
        !valid(data.compareStartAt, data.compareEndAt))
    ) {
      ctx.addIssue({ code: 'custom', message: 'A valid comparison date range is required' });
    }
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, trafficSchema);
  if (error) return error();
  const { websiteId } = await params;
  if (!(await canViewWebsiteSection(auth, websiteId, 'overview'))) return unauthorized();

  const filters = {
    ...(await getQueryFilters(query, websiteId)),
    unit: query.unit,
    timezone: query.timezone,
    visitorType: query.visitorType,
  };
  const { startDate, endDate } = filters;
  const comparisonDates =
    query.compare === 'custom'
      ? { startDate: new Date(query.compareStartAt), endDate: new Date(query.compareEndAt) }
      : query.compare === 'yoy'
        ? { startDate: subYears(startDate, 1), endDate: subYears(endDate, 1) }
        : previousTrafficPeriod(startDate, endDate);
  // Validate bucket count before executing either expensive query.
  try {
    trafficBucketDates(startDate, endDate, filters.unit, filters.timezone);
    if (query.compare !== 'none') {
      trafficBucketDates(
        comparisonDates.startDate,
        comparisonDates.endDate,
        filters.unit,
        filters.timezone,
      );
    }
  } catch (error) {
    return badRequest({ message: (error as Error).message });
  }
  const [data, comparison] = await Promise.all([
    getTrafficReport(websiteId, { ...filters, startDate, endDate }),
    query.compare === 'none'
      ? undefined
      : getTrafficReport(websiteId, { ...filters, ...comparisonDates }),
  ]);
  return json({ ...data, unit: filters.unit, timezone: filters.timezone, comparison });
}
