import { z } from 'zod';
import { mcpError, mcpOptions, mcpResponse } from '@/lib/mcp/http';
import { getMcpDatabase, getMcpManagementAuth, McpAccessError } from '@/lib/mcp/tokens';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  try {
    const auth = await getMcpManagementAuth(request);
    const { tokenId } = await params;
    if (!z.uuid().safeParse(tokenId).success)
      throw new McpAccessError('Invalid token identifier.', 400);
    const result = await getMcpDatabase().mcpToken.updateMany({
      where: { id: tokenId, userId: auth.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new McpAccessError('Active token not found.', 404);
    return mcpResponse(Response.json({ revoked: true }), request);
  } catch (error) {
    return mcpError(error, request);
  }
}

export const OPTIONS = mcpOptions;
