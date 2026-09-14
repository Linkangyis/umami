import type { PrismaClient } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

/** Collection policy is mutable and must not come from a tracker token, Redis or a replica. */
export function getCollectorWebsite(websiteId: string) {
  const client = prisma.client as typeof prisma.client & { $primary?: () => PrismaClient };
  const database = typeof client.$primary === 'function' ? client.$primary() : client;
  return database.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    select: { id: true, recorderEnabled: true, replayConfig: true, userId: true, teamId: true },
  });
}
