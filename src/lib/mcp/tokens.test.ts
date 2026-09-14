import { beforeEach, expect, test, vi } from 'vitest';
import { parseSecureToken } from '@/lib/jwt';
import { parseRequest } from '@/lib/request';
import {
  authenticateMcp,
  createMcpTokenSchema,
  generateMcpToken,
  getMcpManagementAuth,
  hashMcpToken,
  loadMcpPrincipal,
  requireMcpScope,
} from './tokens';

const { findUnique, findFirst, findUser, findMembership, staleFindUnique, canWrite } = vi.hoisted(
  () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findUser: vi.fn(),
    findMembership: vi.fn(),
    staleFindUnique: vi.fn(),
    canWrite: vi.fn(),
  }),
);
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      mcpToken: { findUnique: staleFindUnique },
      $primary: () => ({
        mcpToken: { findUnique },
        website: { findFirst },
        user: { findFirst: findUser },
        teamUser: { findFirst: findMembership },
      }),
    },
  },
  getSchema: () => 'public',
}));
vi.mock('@/lib/request', () => ({ parseRequest: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getBearerToken: () => 'test-login', hasPermission: canWrite }));
vi.mock('@/lib/crypto', () => ({ secret: () => 'test-secret' }));
vi.mock('@/lib/jwt', () => ({ parseSecureToken: vi.fn() }));

const site = '11111111-1111-4111-8111-111111111111';
const user = { id: '22222222-2222-4222-8222-222222222222', username: 'owner', role: 'user' };
const record = {
  id: 'token-id',
  userId: user.id,
  websiteIds: [site],
  scopes: ['analytics:read'],
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(record);
  findFirst.mockResolvedValue({ id: site, userId: user.id, teamId: null });
  findUser.mockResolvedValue(user);
  findMembership.mockResolvedValue(null);
  canWrite.mockResolvedValue(true);
  vi.mocked(parseRequest).mockResolvedValue({ auth: { user: { ...user, isAdmin: false } } });
  vi.mocked(parseSecureToken).mockReturnValue({ userId: user.id } as any);
});

test('generates random credentials and stores only a one-way hash plus a short identifier', () => {
  const first = generateMcpToken();
  const second = generateMcpToken();
  expect(first.token).toMatch(/^xlist_mcp_[A-Za-z0-9_-]{43}$/);
  expect(first.token).not.toBe(second.token);
  expect(first.tokenHash).toBe(hashMcpToken(first.token));
  expect(first.tokenHash).toHaveLength(64);
  expect(first.tokenHash).not.toContain(first.token);
  expect(first.prefix.length).toBeLessThan(first.token.length);
});

test.each([
  { websiteIds: [] },
  { scopes: ['admin'] },
  { expiresInDays: 366 },
  { expiresInDays: 0 },
  { scopes: [] },
])('rejects unsafe token configuration %j', override => {
  expect(
    createMcpTokenSchema.safeParse({ name: 'Agent', websiteIds: [site], ...override }).success,
  ).toBe(false);
});

test('defaults to read analytics, selected websites and thirty-day expiry', () => {
  expect(createMcpTokenSchema.parse({ name: 'Agent', websiteIds: [site, site] })).toMatchObject({
    websiteIds: [site],
    scopes: ['analytics:read'],
    expiresInDays: 30,
  });
});

test('requires a dedicated MCP bearer token and never accepts an application login token', async () => {
  await expect(
    authenticateMcp(
      new Request('http://localhost/api/mcp', { headers: { Authorization: 'Bearer test-login' } }),
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(findUnique).not.toHaveBeenCalled();
  const { token, tokenHash } = generateMcpToken();
  await authenticateMcp(
    new Request('http://localhost/api/mcp', { headers: { Authorization: `Bearer ${token}` } }),
  );
  expect(findUnique).toHaveBeenCalledWith({ where: { tokenHash } });
});

test.each([null, { ...record, revokedAt: new Date() }, { ...record, expiresAt: new Date(0) }])(
  'rejects missing, revoked and expired credentials',
  async value => {
    findUnique.mockResolvedValue(value);
    await expect(loadMcpPrincipal('hash')).rejects.toMatchObject({ status: 401 });
  },
);

test('a deleted user invalidates an otherwise active token', async () => {
  findUser.mockResolvedValue(null);
  await expect(loadMcpPrincipal('hash')).rejects.toMatchObject({ status: 401 });
});

test('an administrator token is still constrained to selected websites', async () => {
  findUser.mockResolvedValue({ ...user, role: 'admin' });
  const principal = await loadMcpPrincipal('hash');
  await expect(
    requireMcpScope(principal, 'analytics:read', '33333333-3333-4333-8333-333333333333'),
  ).rejects.toMatchObject({ status: 403 });
  expect(findFirst).not.toHaveBeenCalled();
});

test('rechecks revocation, current website access and write permissions on tool calls', async () => {
  const principal = await loadMcpPrincipal('hash');
  findUnique.mockResolvedValue({ ...record, revokedAt: new Date() });
  await expect(requireMcpScope(principal, 'analytics:read', site)).rejects.toMatchObject({
    status: 401,
  });
  findUnique.mockResolvedValue({ ...record, scopes: ['analytics:read', 'event-rules:write'] });
  findFirst.mockResolvedValue({ userId: 'other-user', teamId: null });
  await expect(requireMcpScope(principal, 'analytics:read', site)).rejects.toMatchObject({
    status: 403,
  });
  findFirst.mockResolvedValue({ userId: null, teamId: 'team' });
  findMembership.mockResolvedValue({ role: 'team-member' });
  canWrite.mockResolvedValue(false);
  await expect(requireMcpScope(principal, 'event-rules:write', site)).rejects.toMatchObject({
    status: 403,
  });
});

test('uses primary credentials and rejects membership removal despite an older principal', async () => {
  findFirst.mockResolvedValue({ userId: null, teamId: 'team' });
  findMembership.mockResolvedValue({ role: 'team-member' });
  const principal = await loadMcpPrincipal('hash');
  await expect(requireMcpScope(principal, 'analytics:read', site)).resolves.toBeTruthy();
  findMembership.mockResolvedValue(null);
  await expect(requireMcpScope(principal, 'analytics:read', site)).rejects.toMatchObject({
    status: 403,
  });
  expect(staleFindUnique).not.toHaveBeenCalled();
});

test('ungranted optional scopes are rejected', async () => {
  await expect(
    requireMcpScope(await loadMcpPrincipal('hash'), 'sessions:read', site),
  ).rejects.toMatchObject({ status: 403 });
});

test('a global read-only role immediately revokes writes even on an owned website', async () => {
  findUnique.mockResolvedValue({ ...record, scopes: ['analytics:read', 'event-rules:write'] });
  const principal = await loadMcpPrincipal('hash');
  await expect(requireMcpScope(principal, 'event-rules:write', site)).resolves.toBeTruthy();
  findUser.mockResolvedValue({ ...user, role: 'view-only' });
  await expect(requireMcpScope(principal, 'analytics:read', site)).resolves.toBeTruthy();
  await expect(requireMcpScope(principal, 'event-rules:write', site)).rejects.toMatchObject({
    status: 403,
  });
});

test('unfinished two-factor and share sessions cannot mint MCP tokens', async () => {
  vi.mocked(parseSecureToken).mockReturnValue({ type: 'partial-auth', userId: user.id } as any);
  await expect(
    getMcpManagementAuth(new Request('http://localhost/api/me/mcp-tokens')),
  ).rejects.toMatchObject({ status: 401 });
  vi.mocked(parseSecureToken).mockReturnValue({ userId: user.id } as any);
  vi.mocked(parseRequest).mockResolvedValue({ auth: { shareToken: { websiteId: site } } });
  await expect(
    getMcpManagementAuth(new Request('http://localhost/api/me/mcp-tokens')),
  ).rejects.toMatchObject({ status: 401 });
});
