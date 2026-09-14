import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { type ContentGroupDefinition, contentGroupSchema } from '@/lib/content-report';
import { uuid } from '@/lib/crypto';
import prisma, { getSchema } from '@/lib/prisma';

export class ContentGroupLimitError extends Error {}
export class ContentGroupWebsiteNotFoundError extends Error {}
const transaction = prisma.transaction as <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;
function primary() {
  const client = prisma.client as typeof prisma.client & { $primary?: () => PrismaClient };
  return typeof client.$primary === 'function' ? client.$primary() : client;
}

export async function getContentGroups(websiteId: string): Promise<ContentGroupDefinition[]> {
  const groups = await primary().contentGroup.findMany({
    where: { websiteId, website: { deletedAt: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  return groups.map(group => ({
    id: group.id,
    name: group.name,
    rules: contentGroupSchema.shape.rules.parse(group.rules),
  }));
}

export async function createContentGroup(
  websiteId: string,
  values: { name: string; rules: ContentGroupDefinition['rules'] },
) {
  return transaction(async tx => {
    const schema = getSchema();
    const table = schema ? `"${schema.replace(/"/g, '""')}"."website"` : '"website"';
    const websites = await tx.$queryRawUnsafe<{ website_id: string }[]>(
      `select website_id from ${table} where website_id = $1::uuid and deleted_at is null for update`,
      websiteId,
    );
    if (!websites.length) throw new ContentGroupWebsiteNotFoundError();
    if ((await tx.contentGroup.count({ where: { websiteId } })) >= 100)
      throw new ContentGroupLimitError();
    return tx.contentGroup.create({ data: { id: uuid(), websiteId, ...values } });
  });
}

export async function updateContentGroup(
  websiteId: string,
  groupId: string,
  values: { name: string; rules: ContentGroupDefinition['rules'] },
) {
  return transaction(async tx => {
    const result = await tx.contentGroup.updateMany({
      where: { id: groupId, websiteId, website: { deletedAt: null } },
      data: values,
    });
    return result.count ? tx.contentGroup.findUnique({ where: { id: groupId } }) : null;
  });
}

export async function deleteContentGroup(websiteId: string, groupId: string) {
  return primary().contentGroup.deleteMany({ where: { id: groupId, websiteId } });
}
