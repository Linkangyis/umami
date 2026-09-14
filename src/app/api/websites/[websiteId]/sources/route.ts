import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import {
  normalizeSourceHost,
  SOURCE_CATEGORIES,
  SOURCE_ENGINES,
} from '@/lib/source-classification';
import { canViewWebsiteSection } from '@/permissions';
import { getSourceReport } from '@/queries/sql/reports/getSourceReport';
import { SOURCE_SORT_FIELDS, SOURCE_VIEWS } from '@/types/sources';

const exclusions = z.preprocess(
  value => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
  z.array(z.string().trim().min(1).max(500)).max(50).default([]),
);
const schema = withDateRange({
  ...filterParams,
  view: z.enum(SOURCE_VIEWS).default('channels'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(SOURCE_SORT_FIELDS).default('visitors'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
  category: z.enum(SOURCE_CATEGORIES).optional(),
  engine: z.enum(SOURCE_ENGINES.map(engine => engine.id)).optional(),
  keywordStatus: z.enum(['all', 'available', 'unavailable']).default('all'),
  matrix: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  excludeDomains: exclusions,
  excludeKeywords: exclusions,
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
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date range' });
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
  if (!(await canViewWebsiteSection(auth, websiteId, 'overview'))) return unauthorized();
  const filters = await getQueryFilters(
    {
      ...query,
      startAt: query.startAt ?? query.startDate?.getTime(),
      endAt: query.endAt ?? query.endDate?.getTime(),
    },
    websiteId,
  );
  return json(
    await getSourceReport(
      websiteId,
      {
        view: query.view,
        page: query.page,
        pageSize: query.pageSize,
        sort: query.sort,
        direction: query.direction,
        search: query.search,
        category: query.category,
        engine: query.engine,
        keywordStatus: query.keywordStatus,
        matrix: query.matrix,
        excludeDomains: query.excludeDomains.map(normalizeSourceHost).filter(Boolean),
        excludeKeywords: query.excludeKeywords,
      },
      filters,
    ),
  );
}
