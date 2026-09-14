import { McpAccessError } from './tokens';

export function mcpOriginAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const allowed = (process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const url = new URL(request.url);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) allowed.push(url.origin);
  return allowed.includes(origin);
}

export function mcpResponse(response: Response, request?: Request) {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'Origin');
  const origin = request?.headers.get('origin');
  if (request && origin && mcpOriginAllowed(request)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id',
    );
    response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version');
    response.headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  }
  return response;
}

export function mcpError(error: unknown, request?: Request) {
  const known = error instanceof McpAccessError;
  const status = known ? error.status : 500;
  return mcpResponse(
    Response.json(
      {
        error: {
          message: known ? error.message : 'MCP service could not complete the request.',
          status,
        },
      },
      {
        status,
        headers:
          status === 401 ? { 'WWW-Authenticate': 'Bearer realm="MCP", error="invalid_token"' } : {},
      },
    ),
    request,
  );
}

export function mcpOptions(request: Request) {
  if (!mcpOriginAllowed(request))
    return mcpError(new McpAccessError('Origin is not allowed.'), request);
  return mcpResponse(new Response(null, { status: 204 }), request);
}

export async function readMcpBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new McpAccessError('A JSON-RPC request body is required.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65_536) {
      await reader.cancel();
      throw new McpAccessError('Request body exceeds 64 KiB.', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new McpAccessError('Invalid JSON body.', 400);
  }
}
