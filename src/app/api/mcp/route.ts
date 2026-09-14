import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { mcpError, mcpOriginAllowed, mcpResponse, readMcpBody } from '@/lib/mcp/http';
import { createAnalyticsMcpServer } from '@/lib/mcp/server';
import { authenticateMcp, McpAccessError } from '@/lib/mcp/tokens';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let server: ReturnType<typeof createAnalyticsMcpServer> | undefined;
  try {
    if (!mcpOriginAllowed(request)) throw new McpAccessError('Origin is not allowed.');
    const principal = await authenticateMcp(request);
    const body = await readMcpBody(request);
    server = createAnalyticsMcpServer(principal);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    await prisma.client.mcpToken.updateMany({
      where: { id: principal.tokenId, revokedAt: null },
      data: { lastUsedAt: new Date() },
    });
    return mcpResponse(response, request);
  } catch (error) {
    return mcpError(error, request);
  } finally {
    await server?.close();
  }
}

export async function GET(request: Request) {
  try {
    if (!mcpOriginAllowed(request)) throw new McpAccessError('Origin is not allowed.');
    await authenticateMcp(request);
    return mcpResponse(
      new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } }),
      request,
    );
  } catch (error) {
    return mcpError(error, request);
  }
}

export const DELETE = GET;

export function OPTIONS(request: Request) {
  if (!mcpOriginAllowed(request))
    return mcpError(new McpAccessError('Origin is not allowed.'), request);
  return mcpResponse(new Response(null, { status: 204 }), request);
}
