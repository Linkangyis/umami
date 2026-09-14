import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import { normalizeSessionIp } from '@/lib/session-ip';

// Call only after authenticated website access is verified. Public shares never call this query.
export async function getWebsiteSessionIps(
  websiteId: string,
  sessionIds: string[],
): Promise<Record<string, string | null>> {
  if (!sessionIds.length) return {};
  const rows: { id: string; ip: string | null }[] = await runQuery({
    [PRISMA]: () =>
      prisma.rawQuery(
        `select session_id as id, ip from session
       where website_id = {{websiteId::uuid}} and session_id = any({{sessionIds}}::uuid[])`,
        { websiteId, sessionIds },
        'getWebsiteSessionIps',
      ),
    [CLICKHOUSE]: () =>
      clickhouse.rawQuery(
        `select session_id as id, argMaxIf(ip, created_at, ip != '') as ip
       from website_event
       where website_id = {websiteId:UUID} and session_id in {sessionIds:Array(UUID)}
       group by session_id`,
        { websiteId, sessionIds },
        'getWebsiteSessionIps',
      ),
  });
  return Object.fromEntries(rows.map(row => [row.id, normalizeSessionIp(row.ip)]));
}
