import ipaddr from 'ipaddr.js';

export function normalizeSessionIp(value?: string | null): string | null {
  if (!value) return null;
  let candidate = value.trim();
  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) candidate = bracketed[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(candidate)) candidate = candidate.split(':')[0];
  // Interface scopes identify a local adapter, not the address.
  candidate = candidate.split('%')[0];
  try {
    return ipaddr.process(candidate).toString();
  } catch {
    return null;
  }
}

export function getStoredSessionIp(value?: string | null): string | null {
  return process.env.DISABLE_IP_STORAGE === 'true' ? null : normalizeSessionIp(value);
}

export function redactSessionIp<T extends { ip?: unknown }>(session: T): Omit<T, 'ip'> {
  const { ip: _ip, ...rest } = session;
  return rest;
}
