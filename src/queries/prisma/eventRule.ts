import type { Prisma } from '@/generated/prisma/client';
import { uuid } from '@/lib/crypto';
import { MAX_EVENT_RULES, matchesEventRule } from '@/lib/event-rules';
import prisma, { getSchema } from '@/lib/prisma';
import type { EventRuleInput, PublicEventRule } from '@/types/eventRule';

export class EventRuleLimitError extends Error {
  constructor() {
    super(`A website can have at most ${MAX_EVENT_RULES} event rules.`);
  }
}

export class EventRuleWebsiteNotFoundError extends Error {}

const publicFields = {
  id: true,
  name: true,
  selector: true,
  urlPath: true,
  matchType: true,
  eventType: true,
} satisfies Prisma.EventRuleSelect;

const transaction = prisma.transaction as <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

export async function getWebsiteEventRules(websiteId: string) {
  return prisma.client.eventRule.findMany({
    where: { websiteId, website: { deletedAt: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_EVENT_RULES,
  });
}

export async function createEventRule(websiteId: string, data: EventRuleInput) {
  return transaction(async tx => {
    // Serialize creation on the website row so parallel requests cannot exceed the cap.
    const schema = getSchema();
    const table = schema ? `"${schema.replace(/"/g, '""')}"."website"` : '"website"';
    const websites = await tx.$queryRawUnsafe<{ website_id: string }[]>(
      `select website_id from ${table} where website_id = $1::uuid and deleted_at is null for update`,
      websiteId,
    );
    if (!websites.length) throw new EventRuleWebsiteNotFoundError();
    if ((await tx.eventRule.count({ where: { websiteId } })) >= MAX_EVENT_RULES) {
      throw new EventRuleLimitError();
    }
    return tx.eventRule.create({ data: { ...data, id: uuid(), websiteId } });
  });
}

export async function updateEventRule(
  websiteId: string,
  ruleId: string,
  data: Partial<EventRuleInput>,
) {
  return transaction(async tx => {
    const result = await tx.eventRule.updateMany({
      where: { id: ruleId, websiteId, website: { deletedAt: null } },
      data,
    });
    return result.count ? tx.eventRule.findFirst({ where: { id: ruleId, websiteId } }) : null;
  });
}

export async function deleteEventRule(websiteId: string, ruleId: string) {
  return prisma.client.eventRule.deleteMany({ where: { id: ruleId, websiteId } });
}

export async function getPublicEventRules(
  websiteId: string,
  url?: string,
): Promise<PublicEventRule[]> {
  const rules = (await prisma.client.eventRule.findMany({
    where: { websiteId, isEnabled: true, website: { deletedAt: null } },
    select: publicFields,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_EVENT_RULES,
  })) as PublicEventRule[];
  return url ? rules.filter(rule => matchesEventRule(rule, url)) : rules;
}
