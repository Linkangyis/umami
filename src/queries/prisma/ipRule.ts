import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { uuid } from '@/lib/crypto';
import { type IpRuleInput, MAX_IP_RULES, matchesIpRule } from '@/lib/ip-rules';
import prisma, { getSchema } from '@/lib/prisma';
import { normalizeSessionIp } from '@/lib/session-ip';

export class IpRuleLimitError extends Error {}
export class IpRuleWebsiteNotFoundError extends Error {}

const transaction = prisma.transaction as <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

function primary() {
  const client = prisma.client as typeof prisma.client & { $primary?: () => PrismaClient };
  return typeof client.$primary === 'function' ? client.$primary() : client;
}

export async function getWebsiteIpRules(websiteId: string) {
  return primary().websiteIpRule.findMany({
    where: { websiteId, website: { deletedAt: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_IP_RULES,
  });
}

export async function hasWebsiteBlockedIp(websiteId: string, ip: string) {
  const normalized = normalizeSessionIp(ip);
  if (!normalized) return false;
  // Consult the primary on every collection request, including cached tracker sessions.
  // Saving, disabling or removing a rule therefore takes effect without a TTL delay.
  const rules = await primary().websiteIpRule.findMany({
    where: { websiteId, isEnabled: true, website: { deletedAt: null } },
    select: { pattern: true },
    take: MAX_IP_RULES,
  });
  return rules.some(rule => matchesIpRule(normalized, rule.pattern));
}

export async function createIpRule(websiteId: string, data: IpRuleInput) {
  return transaction(async tx => {
    const schema = getSchema();
    const table = schema ? `"${schema.replace(/"/g, '""')}"."website"` : '"website"';
    const websites = await tx.$queryRawUnsafe<{ website_id: string }[]>(
      `select website_id from ${table} where website_id = $1::uuid and deleted_at is null for update`,
      websiteId,
    );
    if (!websites.length) throw new IpRuleWebsiteNotFoundError();
    if ((await tx.websiteIpRule.count({ where: { websiteId } })) >= MAX_IP_RULES) {
      throw new IpRuleLimitError();
    }
    return tx.websiteIpRule.create({ data: { ...data, id: uuid(), websiteId } });
  });
}

export async function updateIpRule(websiteId: string, ruleId: string, data: Partial<IpRuleInput>) {
  return transaction(async tx => {
    const result = await tx.websiteIpRule.updateMany({
      where: { id: ruleId, websiteId, website: { deletedAt: null } },
      data,
    });
    return result.count ? tx.websiteIpRule.findFirst({ where: { id: ruleId, websiteId } }) : null;
  });
}

export async function deleteIpRule(websiteId: string, ruleId: string) {
  return primary().websiteIpRule.deleteMany({ where: { id: ruleId, websiteId } });
}
