import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test, vi } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';

// Opt in with a dedicated migrated PostgreSQL database; the fixture is always rolled back.
test.skipIf(!process.env.UMAMI_TEST_DATABASE_URL)(
  'PostgreSQL connection startup preserves absolute dates with a non-UTC configured timezone',
  async () => {
    const source = new URL(process.env.UMAMI_TEST_DATABASE_URL as string);
    source.searchParams.set('options', '-c timezone=Asia/Shanghai -c statement_timeout=10000');
    // Importing prisma initializes its client; do so only after explicit database opt-in.
    vi.stubEnv('DATABASE_URL', source.toString());
    const { getPrismaPgConfig } = await import('./prisma');
    vi.unstubAllEnvs();
    const client = new PrismaClient({
      adapter: new PrismaPg(getPrismaPgConfig(source.toString())),
    });
    const instant = new Date('2026-09-14T01:00:00.123Z');
    const rollback = new Error('Rollback timezone verification');

    try {
      await expect(
        client.$transaction(async tx => {
          const [result] = await tx.$queryRawUnsafe<
            {
              timezone: string;
              timeout: string;
              epoch: number;
              literal: Date;
            }[]
          >(
            `select current_setting('TimeZone') as timezone,
            current_setting('statement_timeout') as timeout,
            extract(epoch from $1::timestamptz)::float8 as epoch,
            TIMESTAMPTZ '2026-09-14 01:00:00.123+00' as literal`,
            instant,
          );
          expect(result.timezone).toBe('UTC');
          expect(result.timeout).toBe('10s');
          expect(result.epoch * 1000).toBe(instant.getTime());
          expect(result.literal.toISOString()).toBe(instant.toISOString());

          const id = randomUUID();
          const created = await tx.website.create({
            data: { id, name: 'Timezone rollback fixture', createdAt: instant },
          });
          expect(created.createdAt?.toISOString()).toBe(instant.toISOString());
          const [stored] = await tx.$queryRawUnsafe<{ epoch: number }[]>(
            'select extract(epoch from created_at)::float8 as epoch from website where website_id = $1::uuid',
            id,
          );
          expect(stored.epoch * 1000).toBe(instant.getTime());
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    } finally {
      await client.$disconnect();
    }
  },
);
