import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsiteSection } from '@/permissions';
import { getEngagement } from '@/queries/sql/reports/getEngagement';

const schema = withDateRange({ ...filterParams }).superRefine((data, context) => {
  const start = data.startAt ?? data.startDate?.getTime();
  const end = data.endAt ?? data.endDate?.getTime();

  if (
    start != null &&
    end != null &&
    (!Number.isFinite(new Date(start).getTime()) ||
      !Number.isFinite(new Date(end).getTime()) ||
      end < start)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date range' });
  }
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsiteSection(auth, websiteId, 'sessions'))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(
    {
      ...query,
      startAt: query.startAt ?? query.startDate?.getTime(),
      endAt: query.endAt ?? query.endDate?.getTime(),
    },
    websiteId,
  );

  return json(await getEngagement(websiteId, filters));
}
