import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { getBearerToken, hasPermission } from '@/lib/auth';
import { PERMISSIONS, ROLES } from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { parseSecureToken } from '@/lib/jwt';
import prisma, { getSchema } from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import type { Auth } from '@/lib/types';

export const MCP_SCOPES = ['analytics:read', 'sessions:read', 'event-rules:write'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const MAX_MCP_TOKENS = 20;
export const createMcpTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    websiteIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .transform(values => [...new Set(values)]),
    scopes: z
      .array(z.enum(MCP_SCOPES))
      .min(1)
      .max(3)
      .default(['analytics:read'])
      .refine(values => values.includes('analytics:read'))
      .transform(values => [...new Set(values)]),
    expiresInDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();

export class McpAccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}

export const mcpTokenFields = {
  id: true,
  name: true,
  prefix: true,
  websiteIds: true,
  scopes: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
} satisfies Prisma.McpTokenSelect;

export interface McpPrincipal {
  tokenId: string;
  tokenHash: string;
  websiteIds: string[];
  scopes: string[];
  auth: Auth & { user: NonNullable<Auth['user']> };
}

export function getMcpDatabase(): PrismaClient {
  const client = prisma.client as typeof prisma.client & { $primary?: () => PrismaClient };
  // Revocation and authorization must not wait for a read replica to catch up.
  return (typeof client.$primary === 'function' ? client.$primary() : client) as PrismaClient;
}

async function currentUser(id: string) {
  return getMcpDatabase().user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, username: true, role: true },
  });
}

async function primaryWebsitePermission(auth: Auth, websiteId: string, write = false) {
  if (write && auth.user?.role === ROLES.viewOnly) return false;
  const database = getMcpDatabase();
  const website = await database.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { userId: true, teamId: true },
  });
  if (!website || !auth.user) return false;
  if (auth.user.isAdmin || website.userId === auth.user.id) return true;
  if (!website.teamId) return false;
  const membership = await database.teamUser.findFirst({
    where: { teamId: website.teamId, userId: auth.user.id },
    select: { role: true },
  });
  return (
    !!membership && (!write || (await hasPermission(membership.role, PERMISSIONS.websiteUpdate)))
  );
}

export function hashMcpToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateMcpToken() {
  const token = `xlist_mcp_${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashMcpToken(token), prefix: token.slice(0, 18) };
}

export async function getMcpManagementAuth(request: Request) {
  const { auth, error } = await parseRequest(request);
  const payload = parseSecureToken(getBearerToken(request), secret());
  // A share token or unfinished two-factor login cannot mint long-lived credentials.
  if (error || !auth?.user?.id || auth.shareToken || payload?.type) {
    throw new McpAccessError('A completed account login is required.', 401);
  }
  const user = await currentUser(auth.user.id);
  if (!user) throw new McpAccessError('The account is no longer available.', 401);
  return { user: { ...user, isAdmin: user.role === ROLES.admin } } as McpPrincipal['auth'];
}

export async function loadMcpPrincipal(tokenHash: string): Promise<McpPrincipal> {
  const token = await getMcpDatabase().mcpToken.findUnique({ where: { tokenHash } });
  if (!token || token.revokedAt || token.expiresAt.getTime() <= Date.now()) {
    throw new McpAccessError('Invalid or expired MCP token.', 401);
  }
  const user = await currentUser(token.userId);
  if (!user) throw new McpAccessError('Invalid or expired MCP token.', 401);
  return {
    tokenId: token.id,
    tokenHash,
    websiteIds: token.websiteIds,
    scopes: token.scopes,
    auth: {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isAdmin: user.role === ROLES.admin,
      },
    },
  };
}

export async function authenticateMcp(request: Request) {
  const match = /^Bearer (xlist_mcp_[A-Za-z0-9_-]{43})$/i.exec(
    request.headers.get('authorization') || '',
  );
  if (!match) throw new McpAccessError('A valid MCP bearer token is required.', 401);
  return loadMcpPrincipal(hashMcpToken(match[1]));
}

export async function requireMcpScope(
  principal: McpPrincipal,
  scope: McpScope,
  websiteId?: string,
) {
  const fresh = await loadMcpPrincipal(principal.tokenHash);
  if (!fresh.scopes.includes(scope)) throw new McpAccessError(`Token requires ${scope} scope.`);
  if (websiteId) {
    if (!fresh.websiteIds.includes(websiteId.toLowerCase()))
      throw new McpAccessError('Website is outside this token scope.');
    if (!(await primaryWebsitePermission(fresh.auth, websiteId))) {
      throw new McpAccessError('Website access is no longer available.');
    }
    if (
      scope === 'event-rules:write' &&
      !(await primaryWebsitePermission(fresh.auth, websiteId, true))
    ) {
      throw new McpAccessError('Website update permission is required.');
    }
  }
  return fresh;
}

export async function getMcpWebsites(auth: Auth, requestedIds?: string[]) {
  const websites = await getMcpDatabase().website.findMany({
    where: { deletedAt: null, ...(requestedIds ? { id: { in: requestedIds } } : {}) },
    select: { id: true, name: true, domain: true },
    orderBy: { name: 'asc' },
  });
  const permissions = await Promise.all(
    websites.map(website => primaryWebsitePermission(auth, website.id)),
  );
  return websites.filter((_, index) => permissions[index]);
}

export async function createMcpToken(
  auth: McpPrincipal['auth'],
  input: z.output<typeof createMcpTokenSchema>,
) {
  const websites = await getMcpWebsites(auth, input.websiteIds);
  if (websites.length !== input.websiteIds.length)
    throw new McpAccessError('Every selected website must be accessible to this account.');
  if (input.scopes.includes('event-rules:write')) {
    const allowed = await Promise.all(
      input.websiteIds.map(id => primaryWebsitePermission(auth, id, true)),
    );
    if (allowed.some(value => !value))
      throw new McpAccessError('Update permission is required for event rule access.');
  }
  const { token, tokenHash, prefix } = generateMcpToken();
  const schema = getSchema();
  const table = schema ? `"${schema.replace(/"/g, '""')}"."user"` : '"user"';
  const transaction = prisma.transaction as <T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
  const record = await transaction(async tx => {
    const users = await tx.$queryRawUnsafe<{ user_id: string }[]>(
      `select user_id from ${table} where user_id = $1::uuid and deleted_at is null for update`,
      auth.user.id,
    );
    if (!users.length) throw new McpAccessError('The account is no longer available.', 401);
    const count = await tx.mcpToken.count({
      where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (count >= MAX_MCP_TOKENS)
      throw new McpAccessError(
        `Revoke an existing token before creating more than ${MAX_MCP_TOKENS} active tokens.`,
        400,
      );
    return tx.mcpToken.create({
      data: {
        id: randomUUID(),
        userId: auth.user.id,
        name: input.name,
        tokenHash,
        prefix,
        websiteIds: input.websiteIds,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000),
      },
      select: mcpTokenFields,
    });
  });
  return { ...record, token };
}
