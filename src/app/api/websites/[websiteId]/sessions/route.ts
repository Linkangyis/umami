import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, pagingParams, searchParams, withDateRange } from '@/lib/schema';
import { redactSessionIp } from '@/lib/session-ip';
import { canViewWebsiteSection } from '@/permissions';
import { getWebsiteSessions } from '@/queries/sql';
import { getWebsiteSessionIps } from '@/queries/sql/sessions/getWebsiteSessionIps';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...filterParams,
    ...pagingParams,
    ...searchParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsiteSection(auth, websiteId, 'sessions'))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  const includeIp = !!auth?.user && !auth?.shareToken;
  const data = await getWebsiteSessions(websiteId, filters, { includeIpSearch: includeIp });
  const ips = includeIp
    ? await getWebsiteSessionIps(
        websiteId,
        data.data.map(row => row.id),
      )
    : {};

  return json({
    ...data,
    data: data.data.map(row => ({
      ...redactSessionIp(row),
      ...(includeIp ? { ip: ips[row.id] || null } : {}),
    })),
  });
}
