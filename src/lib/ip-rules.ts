import ipaddr from 'ipaddr.js';
import { z } from 'zod';

export const MAX_IP_RULES = 200;

type Address = ReturnType<typeof ipaddr.parse>;
type Range = { pattern: string; family: string; first: bigint; last: bigint };

function address(value: string): Address {
  // Rule input must be an address, never a URL, host:port, octal, or zone identifier.
  if (!value || /[\s%[\]]/.test(value)) throw new Error('Invalid IP address');
  if (!value.includes(':') && !ipaddr.IPv4.isValidFourPartDecimal(value)) {
    throw new Error('Invalid IPv4 address');
  }
  if (
    value.includes(':') &&
    value.includes('.') &&
    !ipaddr.IPv4.isValidFourPartDecimal(value.slice(value.lastIndexOf(':') + 1))
  ) {
    throw new Error('Invalid embedded IPv4 address');
  }
  return ipaddr.process(value);
}

function integer(value: Address): bigint {
  return value.toByteArray().reduce((result, byte) => (result << 8n) + BigInt(byte), 0n);
}

function fromInteger(value: bigint, bytes: number) {
  return ipaddr.fromByteArray(
    Array.from({ length: bytes }, (_, i) => Number((value >> BigInt((bytes - i - 1) * 8)) & 255n)),
  );
}

export function parseIpRule(input: string): Range | null {
  try {
    const value = input.trim();
    if (!value || value.length > 100) return null;
    const parts = value.split('-').map(part => part.trim());
    if (parts.length === 2) {
      const first = address(parts[0]);
      const last = address(parts[1]);
      if (first.kind() !== last.kind() || integer(first) > integer(last)) return null;
      return {
        pattern: `${first.toString()}-${last.toString()}`,
        family: first.kind(),
        first: integer(first),
        last: integer(last),
      };
    }
    if (parts.length !== 1) return null;
    const cidr = value.split('/');
    if (cidr.length > 2) return null;
    const parsed = address(cidr[0]);
    const bits = parsed.kind() === 'ipv4' ? 32 : 128;
    if (cidr.length === 1) {
      return {
        pattern: parsed.toString(),
        family: parsed.kind(),
        first: integer(parsed),
        last: integer(parsed),
      };
    }
    if (!/^\d{1,3}$/.test(cidr[1])) return null;
    let prefix = Number(cidr[1]);
    // Map ::ffff:192.0.2.0/120 to its equivalent IPv4 /24.
    if (cidr[0].includes(':') && parsed.kind() === 'ipv4') prefix -= 96;
    if (prefix < 0 || prefix > bits) return null;
    const width = 1n << BigInt(bits - prefix);
    const first = (integer(parsed) / width) * width;
    return {
      pattern: `${fromInteger(first, bits / 8).toString()}/${prefix}`,
      family: parsed.kind(),
      first,
      last: first + width - 1n,
    };
  } catch {
    return null;
  }
}

export function matchesIpRule(ip: string, pattern: string): boolean {
  const range = parseIpRule(pattern);
  if (!range) return false;
  try {
    const parsed = address(ip);
    const value = integer(parsed);
    return range.family === parsed.kind() && value >= range.first && value <= range.last;
  } catch {
    return false;
  }
}

const pattern = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(value => !!parseIpRule(value), 'Invalid IP address, CIDR, or address range')
  .transform((value): string => parseIpRule(value)?.pattern || value)
  .pipe(z.string());

export const createIpRuleSchema = z
  .object({
    pattern,
    name: z.string().trim().max(100).default(''),
    isEnabled: z.boolean().default(true),
  })
  .strict();
export const updateIpRuleSchema = z
  .object({
    pattern: pattern.optional(),
    name: z.string().trim().max(100).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field');
export interface IpRuleInput {
  pattern: string;
  name: string;
  isEnabled: boolean;
}
