import { afterEach, expect, test, vi } from 'vitest';
import { mcpOriginAllowed, readMcpBody } from './http';

vi.mock('./tokens', () => ({
  McpAccessError: class extends Error {
    constructor(
      message: string,
      public status = 403,
    ) {
      super(message);
    }
  },
}));
afterEach(() => vi.unstubAllEnvs());

test('allows server clients without Origin and rejects untrusted browser origins', () => {
  vi.stubEnv('MCP_ALLOWED_ORIGINS', 'https://trusted.example');
  expect(mcpOriginAllowed(new Request('https://analytics.example/api/mcp'))).toBe(true);
  expect(
    mcpOriginAllowed(
      new Request('https://analytics.example/api/mcp', {
        headers: { Origin: 'https://evil.example' },
      }),
    ),
  ).toBe(false);
  expect(
    mcpOriginAllowed(
      new Request('https://analytics.example/api/mcp', {
        headers: { Origin: 'https://trusted.example' },
      }),
    ),
  ).toBe(true);
  expect(
    mcpOriginAllowed(
      new Request('https://analytics.example/api/mcp', { headers: { Origin: 'null' } }),
    ),
  ).toBe(false);
});

test('enforces body size even without a Content-Length header', async () => {
  await expect(
    readMcpBody(
      new Request('http://localhost/api/mcp', { method: 'POST', body: 'a'.repeat(65_537) }),
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readMcpBody(new Request('http://localhost/api/mcp', { method: 'POST', body: '{' })),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readMcpBody(
      new Request('http://localhost/api/mcp', { method: 'POST', body: '{"jsonrpc":"2.0"}' }),
    ),
  ).resolves.toEqual({ jsonrpc: '2.0' });
});
