import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getWebsiteStats } from '@/queries/sql';
import { getTrafficReport } from '@/queries/sql/reports/getTrafficReport';
import { createAnalyticsMcpServer } from './server';
import type { McpPrincipal } from './tokens';

vi.mock('./tokens', () => ({
  McpAccessError: class extends Error {},
  requireMcpScope: vi.fn(async principal => principal),
  getMcpWebsites: vi.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Allowed' },
  ]),
}));
vi.mock('@/lib/request', () => ({
  getQueryFilters: vi.fn(async input => ({
    ...input,
    startDate: new Date(input.startAt),
    endDate: new Date(input.endAt),
  })),
}));
vi.mock('@/queries/sql', () => ({
  getWebsiteStats: vi.fn(async () => ({ pageviews: 7, visitors: 2 })),
  getEventMetrics: vi.fn(),
  getPageviewMetrics: vi.fn(),
  getSessionMetrics: vi.fn(),
  getWebsiteSessions: vi.fn(),
}));
vi.mock('@/queries/sql/reports/getEngagement', () => ({ getEngagement: vi.fn() }));
vi.mock('@/queries/sql/reports/getTrafficReport', () => ({
  getTrafficReport: vi.fn(async () => ({ rows: [], summary: {} })),
}));
vi.mock('@/queries/sql/sessions/getWebsiteSessionIps', () => ({ getWebsiteSessionIps: vi.fn() }));
vi.mock('@/queries/prisma/eventRule', () => ({
  createEventRule: vi.fn(),
  updateEventRule: vi.fn(),
  deleteEventRule: vi.fn(),
  getWebsiteEventRules: vi.fn(),
}));

let client: Client;
let server: ReturnType<typeof createAnalyticsMcpServer>;
beforeEach(async () => {
  vi.clearAllMocks();
  server = createAnalyticsMcpServer({ scopes: ['analytics:read'] } as McpPrincipal);
  client = new Client({ name: 'regression-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});
afterEach(async () => {
  await client.close();
  await server.close();
});

test('official SDK initialization and tool discovery expose only granted capabilities', async () => {
  const { tools } = await client.listTools();
  expect(tools.map(tool => tool.name)).toContain('get_overview');
  expect(tools.map(tool => tool.name)).not.toContain('get_sessions');
  expect(tools.map(tool => tool.name)).not.toContain('create_event_rule');
  expect(tools.every(tool => tool.annotations?.readOnlyHint)).toBe(true);
});

test('official SDK call returns structured data and enforces argument/date validation', async () => {
  const args = {
    websiteId: '11111111-1111-4111-8111-111111111111',
    startDate: '2026-09-01T00:00:00Z',
    endDate: '2026-09-02T00:00:00Z',
  };
  const result = await client.callTool({ name: 'get_overview', arguments: args });
  expect(result.structuredContent).toEqual({ data: { pageviews: 7, visitors: 2 } });
  const bad = await client.callTool({
    name: 'get_overview',
    arguments: { ...args, endDate: '2026-08-01T00:00:00Z' },
  });
  expect(bad.isError).toBe(true);
  const unknown = await client.callTool({
    name: 'get_overview',
    arguments: { ...args, sql: 'select * from user' },
  });
  expect(unknown.isError).toBe(true);
  expect(getWebsiteStats).toHaveBeenCalledTimes(1);
});

test('supports twenty-four monthly reporting periods without weakening bucket limits', async () => {
  const args = {
    websiteId: '11111111-1111-4111-8111-111111111111',
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2025-12-31T23:59:59Z',
    unit: 'month',
  };
  const result = await client.callTool({ name: 'get_traffic', arguments: args });
  expect(result.isError).not.toBe(true);
  expect(getTrafficReport).toHaveBeenCalledWith(
    args.websiteId,
    expect.objectContaining({
      unit: 'month',
      startDate: new Date(args.startDate),
      endDate: new Date(args.endDate),
    }),
  );
  const tooMany = await client.callTool({
    name: 'get_traffic',
    arguments: { ...args, unit: 'hour' },
  });
  expect(tooMany.isError).toBe(true);
  expect(getTrafficReport).toHaveBeenCalledTimes(1);
});
