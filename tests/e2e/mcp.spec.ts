import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteUser, deleteWebsite, loginViaApi, umamiUser } from './helpers';

test.use({ trace: 'off', video: 'off' });

test('official MCP HTTP client authenticates, respects scopes and ownership, and stops after revoke', async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const auth = await loginViaApi(request);
  const websiteId = uuid();
  const outsideWebsiteId = uuid();
  const tokenIds: { id: string; owner: typeof auth }[] = [];
  const clients: Client[] = [];
  let secondUserId: string | undefined;
  let teamId: string | undefined;
  const baseUrl = String(testInfo.project.use.baseURL || 'http://localhost:3000');
  const endpoint = new URL('/api/mcp', baseUrl);

  for (const id of [websiteId, outsideWebsiteId]) {
    const created = await request.post('/api/websites', {
      headers: authHeaders(auth),
      data: {
        id,
        createdBy: umamiUser.id,
        name: 'MCP integration fixture',
        domain: 'mcp-test.example',
      },
    });
    expect(created.status()).toBe(200);
  }
  const mint = async (scopes: string[] = ['analytics:read'], owner = auth, sites = [websiteId]) => {
    const response = await request.post('/api/me/mcp-tokens', {
      headers: authHeaders(owner),
      data: { name: 'SDK verification', websiteIds: sites, scopes, expiresInDays: 1 },
    });
    expect(response.status()).toBe(201);
    const result = await response.json();
    tokenIds.push({ id: result.id, owner });
    expect(response.headers()['cache-control']).toBe('no-store');
    return result;
  };
  const connect = async (token: string) => {
    const client = new Client({ name: 'umami-http-regression', version: '1.0.0' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  };

  try {
    expect((await request.post('/api/mcp', { data: {} })).status()).toBe(401);
    const credential = await mint();
    const bearer = {
      Authorization: `Bearer ${credential.token}`,
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    };
    const metadata = await request.get('/api/me/mcp-tokens', { headers: authHeaders(auth) });
    expect(await metadata.text()).not.toContain(credential.token);
    expect((await request.get('/api/me', { headers: bearer })).status()).toBe(401);
    expect(
      (
        await request.post('/api/mcp', {
          headers: { ...bearer, Origin: 'https://untrusted.example' },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect((await request.get('/api/mcp', { headers: bearer })).status()).toBe(405);
    const malformed = await request.post('/api/mcp', { headers: bearer, data: '{' });
    expect(malformed.status()).toBe(400);

    const client = await connect(credential.token);
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toContain('get_overview');
    expect(listed.tools.map(tool => tool.name)).not.toContain('get_sessions');
    expect(listed.tools.map(tool => tool.name)).not.toContain('create_event_rule');
    const websites = await client.callTool({ name: 'list_websites', arguments: {} });
    expect((websites.structuredContent as any).data.map((website: any) => website.id)).toEqual([
      websiteId,
    ]);
    const args = {
      websiteId,
      startDate: new Date(Date.now() - 86_400_000).toISOString(),
      endDate: new Date().toISOString(),
    };
    const overview = await client.callTool({ name: 'get_overview', arguments: args });
    expect(overview.isError).not.toBe(true);
    expect((overview.structuredContent as any).data).toMatchObject({ pageviews: 0, visitors: 0 });
    const monthly = await client.callTool({
      name: 'get_traffic',
      arguments: {
        websiteId,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2025-12-31T23:59:59Z',
        unit: 'month',
      },
    });
    expect(monthly.isError).not.toBe(true);
    expect((monthly.structuredContent as any).data.rows).toHaveLength(24);
    const denied = await client.callTool({
      name: 'get_overview',
      arguments: { ...args, websiteId: outsideWebsiteId },
    });
    expect(denied.isError).toBe(true);
    const invalid = await client.callTool({
      name: 'get_overview',
      arguments: { ...args, sql: 'select * from user' },
    });
    expect(invalid.isError).toBe(true);

    const username = `mcp-${uuid().slice(0, 8)}`;
    const password = `test-${uuid()}`;
    const secondUser = await request.post('/api/users', {
      headers: authHeaders(auth),
      data: { username, password, role: 'user' },
    });
    expect(secondUser.status()).toBe(200);
    secondUserId = (await secondUser.json()).id;
    const otherAuth = await loginViaApi(request, username, password);
    const otherTokens = await request.get('/api/me/mcp-tokens', {
      headers: authHeaders(otherAuth),
    });
    expect((await otherTokens.json()).tokens).toEqual([]);
    const ownership = await request.delete(`/api/me/mcp-tokens/${credential.id}`, {
      headers: authHeaders(otherAuth),
    });
    expect(ownership.status()).toBe(404);
    expect((await client.callTool({ name: 'connection_status', arguments: {} })).isError).not.toBe(
      true,
    );

    const writeToken = await mint(['analytics:read', 'sessions:read', 'event-rules:write']);
    const writer = await connect(writeToken.token);
    const rules = await writer.callTool({
      name: 'create_event_rule',
      arguments: {
        websiteId,
        rule: { name: 'mcp-test-click', selector: '#contact', urlPath: '/' },
      },
    });
    expect(rules.isError).not.toBe(true);
    const ruleId = (rules.structuredContent as any).data.id;
    const changed = await writer.callTool({
      name: 'update_event_rule',
      arguments: { websiteId, ruleId, rule: { isEnabled: false } },
    });
    expect((changed.structuredContent as any).data.isEnabled).toBe(false);
    const removed = await writer.callTool({
      name: 'delete_event_rule',
      arguments: { websiteId, ruleId },
    });
    expect((removed.structuredContent as any).data.deleted).toBe(true);
    expect((await writer.callTool({ name: 'get_sessions', arguments: args })).isError).not.toBe(
      true,
    );

    expect(
      (
        await request.post(`/api/websites/${outsideWebsiteId}/transfer`, {
          headers: authHeaders(auth),
          data: { userId: secondUserId },
        })
      ).status(),
    ).toBe(200);
    const memberToken = await mint(['analytics:read'], otherAuth, [outsideWebsiteId]);
    const memberClient = await connect(memberToken.token);
    const memberArgs = { ...args, websiteId: outsideWebsiteId };
    expect(
      (await memberClient.callTool({ name: 'get_overview', arguments: memberArgs })).isError,
    ).not.toBe(true);
    expect(
      (
        await request.post(`/api/websites/${outsideWebsiteId}/transfer`, {
          headers: authHeaders(auth),
          data: { userId: umamiUser.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await memberClient.callTool({ name: 'get_overview', arguments: memberArgs })).isError,
    ).toBe(true);
    const team = await request.post('/api/teams', {
      headers: authHeaders(auth),
      data: { name: `MCP membership ${uuid().slice(0, 8)}` },
    });
    expect(team.status()).toBe(200);
    teamId = (await team.json())[0].id;
    expect(
      (
        await request.post(`/api/teams/${teamId}/users`, {
          headers: authHeaders(auth),
          data: { userId: secondUserId, role: 'team-member' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post(`/api/websites/${outsideWebsiteId}/transfer`, {
          headers: authHeaders(auth),
          data: { teamId },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await memberClient.callTool({ name: 'get_overview', arguments: memberArgs })).isError,
    ).not.toBe(true);
    expect(
      (
        await request.delete(`/api/teams/${teamId}/users/${secondUserId}`, {
          headers: authHeaders(auth),
        })
      ).status(),
    ).toBe(200);
    expect(
      (await memberClient.callTool({ name: 'get_overview', arguments: memberArgs })).isError,
    ).toBe(true);

    const revoked = await request.delete(`/api/me/mcp-tokens/${credential.id}`, {
      headers: authHeaders(auth),
    });
    expect(revoked.status()).toBe(200);
    const rejected = await request.post('/api/mcp', {
      headers: bearer,
      data: { jsonrpc: '2.0', id: 7, method: 'tools/list' },
    });
    expect(rejected.status()).toBe(401);
    expect(rejected.headers()['www-authenticate']).toContain('Bearer');

    await deleteWebsite(request, auth, websiteId);
    expect((await writer.callTool({ name: 'get_overview', arguments: args })).isError).toBe(true);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    for (const token of tokenIds)
      await request.delete(`/api/me/mcp-tokens/${token.id}`, { headers: authHeaders(token.owner) });
    await request.delete(`/api/websites/${websiteId}`, { headers: authHeaders(auth) });
    await deleteWebsite(request, auth, outsideWebsiteId);
    if (teamId) await request.delete(`/api/teams/${teamId}`, { headers: authHeaders(auth) });
    if (secondUserId) await deleteUser(request, auth, secondUserId);
  }
});
