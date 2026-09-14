import { mcpError, mcpOptions, mcpResponse } from '@/lib/mcp/http';
import {
  createMcpToken,
  createMcpTokenSchema,
  getMcpDatabase,
  getMcpManagementAuth,
  getMcpWebsites,
  MAX_MCP_TOKENS,
  mcpTokenFields,
} from '@/lib/mcp/tokens';

export async function GET(request: Request) {
  try {
    const auth = await getMcpManagementAuth(request);
    const now = new Date();
    const [activeTokens, inactiveTokens, websites] = await Promise.all([
      getMcpDatabase().mcpToken.findMany({
        where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: now } },
        select: mcpTokenFields,
        orderBy: { createdAt: 'desc' },
      }),
      getMcpDatabase().mcpToken.findMany({
        where: {
          userId: auth.user.id,
          OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }],
        },
        select: mcpTokenFields,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      getMcpWebsites(auth),
    ]);
    return mcpResponse(
      Response.json({
        tokens: [...activeTokens, ...inactiveTokens],
        websites,
        limit: MAX_MCP_TOKENS,
      }),
      request,
    );
  } catch (error) {
    return mcpError(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getMcpManagementAuth(request);
    const parsed = createMcpTokenSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success)
      return mcpResponse(
        Response.json(
          {
            error: {
              message: 'Choose a name, accessible websites, valid scopes and expiry of 1–365 days.',
              status: 400,
            },
          },
          { status: 400 },
        ),
        request,
      );
    return mcpResponse(
      Response.json(await createMcpToken(auth, parsed.data), { status: 201 }),
      request,
    );
  } catch (error) {
    return mcpError(error, request);
  }
}

export const OPTIONS = mcpOptions;
