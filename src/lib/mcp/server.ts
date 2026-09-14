import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EVENT_TYPE } from '@/lib/constants';
import { createEventRuleSchema, updateEventRuleSchema } from '@/lib/event-rules';
import { getQueryFilters } from '@/lib/request';
import { TRAFFIC_UNITS, trafficBucketDates } from '@/lib/traffic';
import {
  createEventRule,
  deleteEventRule,
  getWebsiteEventRules,
  updateEventRule,
} from '@/queries/prisma/eventRule';
import {
  getEventMetrics,
  getPageviewMetrics,
  getSessionMetrics,
  getWebsiteSessions,
  getWebsiteStats,
} from '@/queries/sql';
import { getEngagement } from '@/queries/sql/reports/getEngagement';
import { getTrafficReport } from '@/queries/sql/reports/getTrafficReport';
import { getWebsiteSessionIps } from '@/queries/sql/sessions/getWebsiteSessionIps';
import {
  getMcpWebsites,
  McpAccessError,
  type McpPrincipal,
  type McpScope,
  requireMcpScope,
} from './tokens';

const matchValue = z.string().max(500);
const analyticsFields = {
  websiteId: z.uuid(),
  startDate: z.iso.datetime({ offset: true }).describe('Inclusive start instant as ISO 8601.'),
  endDate: z.iso
    .datetime({ offset: true })
    .describe('Inclusive end instant; at most 1830 days (five years) after start.'),
  timezone: z
    .string()
    .max(100)
    .default('UTC')
    .refine(value => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA timezone'),
  filters: z
    .object({
      path: matchValue.optional(),
      country: matchValue.optional(),
      region: matchValue.optional(),
      city: matchValue.optional(),
      browser: matchValue.optional(),
      device: matchValue.optional(),
      hostname: matchValue.optional(),
      referrer: matchValue.optional(),
      event: matchValue.optional(),
    })
    .strict()
    .default({})
    .describe('Exact-match filters; use ordinary values such as US or /pricing.'),
};
const analyticsSchema = z.object(analyticsFields).strict();
const trafficSchema = z
  .object({
    ...analyticsFields,
    unit: z.enum(TRAFFIC_UNITS).default('day'),
    visitorType: z.enum(['all', 'new', 'returning']).default('all'),
  })
  .strict();
const metricsSchema = z
  .object({
    ...analyticsFields,
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export async function mcpQueryFilters(input: z.output<typeof analyticsSchema>, unit = 'day') {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (startDate > endDate || endDate.getTime() - startDate.getTime() > 1830 * 86_400_000) {
    throw new McpAccessError(
      'Choose an ordered date range of at most 1830 days (five years).',
      400,
    );
  }
  const filters = Object.fromEntries(
    Object.entries(input.filters).map(([key, value]) => [key, `eq.${value}`]),
  );
  const result = await getQueryFilters(
    {
      ...filters,
      startAt: startDate.getTime(),
      endAt: endDate.getTime(),
      timezone: input.timezone,
      unit,
    },
    input.websiteId,
  );
  return {
    ...result,
    startDate: result.startDate ?? startDate,
    endDate: result.endDate ?? endDate,
  };
}

export function createAnalyticsMcpServer(principal: McpPrincipal) {
  const server = new McpServer({ name: 'xlist-analytics', version: '1.0.0' });
  const register = (
    name: string,
    description: string,
    schema: z.ZodObject<any>,
    scope: McpScope,
    handler: (input: any, current: McpPrincipal) => Promise<unknown>,
    readOnly = true,
  ) => {
    if (!principal.scopes.includes(scope)) return;
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: !readOnly,
          idempotentHint: readOnly,
          openWorldHint: false,
        },
      },
      async input => {
        try {
          const current = await requireMcpScope(
            principal,
            scope,
            input.websiteId as string | undefined,
          );
          const value = await handler(input, current);
          const result = JSON.parse(
            JSON.stringify({ data: value }, (_key, item) =>
              typeof item === 'bigint' ? item.toString() : item,
            ),
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          const message =
            error instanceof McpAccessError
              ? error.message
              : 'The requested analytics operation could not be completed.';
          return { content: [{ type: 'text', text: message }], isError: true };
        }
      },
    );
  };

  register(
    'connection_status',
    'Verify the authenticated account and token scopes. Does not reveal credentials.',
    z.object({}).strict(),
    'analytics:read',
    async (_input, current) => ({
      account: current.auth.user.username,
      role: current.auth.user.role,
      scopes: current.scopes,
      websiteIds: current.websiteIds,
    }),
  );
  register(
    'list_websites',
    'List only selected websites that this account can currently access.',
    z.object({}).strict(),
    'analytics:read',
    async (_input, current) => getMcpWebsites(current.auth, current.websiteIds),
  );
  register(
    'get_overview',
    'Read pageviews, visitors, visits, bounces and total visit duration.',
    analyticsSchema,
    'analytics:read',
    async input => getWebsiteStats(input.websiteId, await mcpQueryFilters(input)),
  );
  const traffic = async (input: z.output<typeof trafficSchema>) => {
    const filters = await mcpQueryFilters(input, input.unit);
    trafficBucketDates(filters.startDate, filters.endDate, input.unit, input.timezone);
    return getTrafficReport(input.websiteId, {
      ...filters,
      startDate: filters.startDate,
      endDate: filters.endDate,
      unit: input.unit,
      visitorType: input.visitorType,
    });
  };
  register(
    'get_time_series',
    'Read traffic over hour/day/week/month intervals, including empty buckets.',
    trafficSchema,
    'analytics:read',
    async input => (await traffic(input)).rows,
  );
  register(
    'get_traffic',
    'Read traffic summary and time series with new/returning visitor filtering.',
    trafficSchema,
    'analytics:read',
    traffic,
  );
  register(
    'get_engagement',
    'Read new/returning visitors and duration, depth and frequency distributions. Identities rotate; these are not persistent people.',
    analyticsSchema,
    'analytics:read',
    async input => getEngagement(input.websiteId, await mcpQueryFilters(input)),
  );
  register(
    'get_events',
    'Read aggregated custom event names and counts; no event property values.',
    metricsSchema,
    'analytics:read',
    async input =>
      getEventMetrics(
        input.websiteId,
        { type: 'event', limit: String(input.limit), offset: String(input.offset) },
        { ...(await mcpQueryFilters(input)), eventType: EVENT_TYPE.customEvent },
      ),
  );
  register(
    'get_pages',
    'Read page path rankings, with a bounded limit and offset.',
    metricsSchema,
    'analytics:read',
    async input =>
      getPageviewMetrics(
        input.websiteId,
        { type: 'path', limit: input.limit, offset: input.offset },
        await mcpQueryFilters(input),
      ),
  );
  register(
    'get_geography',
    'Read aggregated country, region or city rankings.',
    metricsSchema.extend({ dimension: z.enum(['country', 'region', 'city']).default('country') }),
    'analytics:read',
    async input =>
      getSessionMetrics(
        input.websiteId,
        { type: input.dimension, limit: input.limit, offset: input.offset },
        await mcpQueryFilters(input),
      ),
  );
  register(
    'get_sessions',
    'Read paged visitor session details including IP addresses. Requires explicit sessions:read permission.',
    analyticsSchema.extend({
      page: z.number().int().min(1).max(1000).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }),
    'sessions:read',
    async input => {
      const result = await getWebsiteSessions(input.websiteId, {
        ...(await mcpQueryFilters(input)),
        page: input.page,
        pageSize: input.pageSize,
      });
      const ips = await getWebsiteSessionIps(
        input.websiteId,
        result.data.map(row => row.id),
      );
      return { ...result, data: result.data.map(row => ({ ...row, ip: ips[row.id] || null })) };
    },
  );
  register(
    'list_event_rules',
    'Read the configured event rules for a selected website.',
    z.object({ websiteId: z.uuid() }).strict(),
    'analytics:read',
    async input => getWebsiteEventRules(input.websiteId),
  );
  register(
    'create_event_rule',
    'Create an event binding rule. Requires explicit event-rules:write scope and current website update permission.',
    z.object({ websiteId: z.uuid(), rule: createEventRuleSchema.strict() }).strict(),
    'event-rules:write',
    async input => createEventRule(input.websiteId, input.rule),
    false,
  );
  register(
    'update_event_rule',
    'Update a rule belonging to the selected website. Requires event-rules:write.',
    z.object({ websiteId: z.uuid(), ruleId: z.uuid(), rule: updateEventRuleSchema }).strict(),
    'event-rules:write',
    async input => {
      const result = await updateEventRule(input.websiteId, input.ruleId, input.rule);
      if (!result) throw new McpAccessError('Rule was not found in this website.', 404);
      return result;
    },
    false,
  );
  register(
    'delete_event_rule',
    'Delete a configured rule. Already collected event data remains unchanged. Requires event-rules:write.',
    z.object({ websiteId: z.uuid(), ruleId: z.uuid() }).strict(),
    'event-rules:write',
    async input => ({ deleted: (await deleteEventRule(input.websiteId, input.ruleId)).count > 0 }),
    false,
  );
  return server;
}
