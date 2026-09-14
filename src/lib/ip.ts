import ipaddr from 'ipaddr.js';

export const IP_ADDRESS_HEADERS = [
  ...(process.env.CLOUD_MODE ? ['x-umami-client-ip'] : []), // Umami custom header (cloud mode only)
  'true-client-ip', // CDN
  'cf-connecting-ip', // Cloudflare
  'fastly-client-ip', // Fastly
  'x-nf-client-connection-ip', // Netlify
  'do-connecting-ip', // Digital Ocean
  'x-real-ip', // Reverse proxy
  'x-appengine-user-ip', // Google App Engine
  'x-forwarded-for',
  'forwarded',
  'x-client-ip',
  'x-cluster-client-ip',
  'x-forwarded',
];

function normalizeIp(ip?: string | null) {
  if (!ip) return ip;

  try {
    const parsed = ipaddr.parse(ip);

    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      return (parsed as ipaddr.IPv6).toIPv4Address().toString();
    }

    return parsed.toString();
  } catch {
    // Fallback: return original if parsing fails
    return ip;
  }
}

function resolveIp(ip?: string | null) {
  if (!ip) return ip;

  // First, try as-is
  const normalized = normalizeIp(ip);
  try {
    ipaddr.parse(normalized);
    return normalized;
  } catch {
    // try stripping port (handles IPv4:port; leaves IPv6 intact)
    const stripped = stripPort(ip);
    if (stripped !== ip) {
      const normalizedStripped = normalizeIp(stripped);
      try {
        ipaddr.parse(normalizedStripped);
        return normalizedStripped;
      } catch {
        return normalizedStripped;
      }
    }

    return normalized;
  }
}

function parseHeaderValue(header: string, value: string) {
  if (header === 'x-forwarded-for') {
    return resolveIp(value?.split(',')?.[0]?.trim());
  }

  if (header === 'forwarded') {
    const first = splitForwarded(value, ',')[0];
    const parameter = splitForwarded(first, ';').find(part => /^\s*for\s*=/i.test(part));
    if (!parameter) return undefined;
    let node = parameter.slice(parameter.indexOf('=') + 1).trim();
    if (node.startsWith('"')) {
      if (!node.endsWith('"')) return undefined;
      node = node.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    const ip = resolveIp(node);
    // An unknown/obfuscated first hop must never be replaced by a later proxy address.
    return ip && ipaddr.isValid(ip) ? ip : undefined;
  }

  return resolveIp(value);
}

function splitForwarded(value: string, separator: ',' | ';') {
  const result: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === separator) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

export function getIpAddress(headers: Headers) {
  const customHeader = process.env.CLIENT_IP_HEADER;

  if (customHeader && headers.get(customHeader)) {
    return parseHeaderValue(customHeader.toLowerCase(), headers.get(customHeader));
  }

  const header = IP_ADDRESS_HEADERS.find(name => headers.get(name));
  if (!header) {
    return undefined;
  }

  return parseHeaderValue(header, headers.get(header));
}

export function stripPort(ip?: string | null) {
  if (!ip) {
    return ip;
  }

  // Valid IPv6 (including mapped IPv4) contains colons that are not a port separator.
  if (ipaddr.isValid(ip)) return ip;
  const bracketed = ip.match(/^\[([^\]]+)\](?::(?:\d+|_[a-zA-Z0-9._-]+))?$/);
  if (bracketed) return bracketed[1];
  const ipv4Port = ip.match(/^(\d+\.\d+\.\d+\.\d+):(?:\d+|_[a-zA-Z0-9._-]+)$/);
  if (ipv4Port) return ipv4Port[1];

  return ip;
}
