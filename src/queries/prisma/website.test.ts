import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteWebsite, resetWebsite } from './website';

const { transactionMock, redisDelMock, redisSetMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    transaction: transactionMock,
  },
  getSchema: () => new URL(process.env.DATABASE_URL || '').searchParams.get('schema'),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    client: {
      del: redisDelMock,
      set: redisSetMock,
    },
  },
}));

function createDeleteTx(calls: string[]) {
  return {
    campaignLink: {
      deleteMany: vi.fn(async () => {
        calls.push('campaignLink');
      }),
    },
    campaignParameter: {
      deleteMany: vi.fn(async () => {
        calls.push('campaignParameter');
      }),
    },
    websiteIpRule: {
      deleteMany: vi.fn(async () => {
        calls.push('websiteIpRule');
      }),
    },
    contentGroup: {
      deleteMany: vi.fn(async () => {
        calls.push('contentGroup');
      }),
    },
    eventRule: {
      deleteMany: vi.fn(async () => {
        calls.push('eventRule');
      }),
    },
    sessionReplaySaved: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionReplaySaved');
      }),
    },
    sessionReplay: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionReplay');
      }),
    },
    heatmapEvent: {
      deleteMany: vi.fn(async () => {
        calls.push('heatmapEvent');
      }),
    },
    revenue: {
      deleteMany: vi.fn(async () => {
        calls.push('revenue');
      }),
    },
    eventData: {
      deleteMany: vi.fn(async () => {
        calls.push('eventData');
      }),
    },
    $executeRawUnsafe: vi.fn(async () => {
      calls.push('rawSql');
    }),
    sessionData: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionData');
      }),
    },
    sessionLink: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionLink');
      }),
    },
    websiteEvent: {
      deleteMany: vi.fn(async () => {
        calls.push('websiteEvent');
      }),
    },
    session: {
      deleteMany: vi.fn(async () => {
        calls.push('session');
      }),
    },
    report: {
      deleteMany: vi.fn(async () => {
        calls.push('report');
      }),
    },
    segment: {
      deleteMany: vi.fn(async () => {
        calls.push('segment');
      }),
    },
    share: {
      deleteMany: vi.fn(async () => {
        calls.push('share');
      }),
    },
    website: {
      delete: vi.fn(async () => {
        calls.push('websiteDelete');
        return { id: 'website-1' };
      }),
      update: vi.fn(async () => {
        calls.push('websiteUpdate');
        return { id: 'website-1' };
      }),
    },
  };
}

describe('website delete dependencies', () => {
  beforeEach(() => {
    transactionMock.mockReset();
    redisDelMock.mockReset();
    redisSetMock.mockReset();
    delete process.env.CLOUD_MODE;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/umami?schema=public';
  });

  test.each([false, true])(
    'deleteWebsite cleans configurations and dependent data (soft-delete: %s)',
    async cloudMode => {
      if (cloudMode) process.env.CLOUD_MODE = '1';
      const calls: string[] = [];
      const tx = createDeleteTx(calls);

      transactionMock.mockImplementation(async callback => callback(tx));

      await deleteWebsite('website-1');
      expect(tx.contentGroup.deleteMany).toHaveBeenCalledWith({
        where: { websiteId: 'website-1' },
      });
      expect(tx.eventRule.deleteMany).toHaveBeenCalledWith({ where: { websiteId: 'website-1' } });

      expect(tx.eventData.deleteMany).toHaveBeenCalledWith({
        where: { websiteId: 'website-1' },
      });
      expect(tx.heatmapEvent.deleteMany).toHaveBeenCalledWith({
        where: { websiteId: 'website-1' },
      });
      expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(1, 'SET search_path TO "public";');
      expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('delete from event_data'),
        'website-1',
      );
      expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('website_event.website_id = $1'),
        'website-1',
      );
      expect(calls).toEqual([
        'campaignLink',
        'campaignParameter',
        'websiteIpRule',
        'contentGroup',
        'eventRule',
        'sessionReplaySaved',
        'sessionReplay',
        'heatmapEvent',
        'revenue',
        'eventData',
        'rawSql',
        'rawSql',
        'sessionData',
        'sessionLink',
        'websiteEvent',
        'session',
        'report',
        'segment',
        'share',
        cloudMode ? 'websiteUpdate' : 'websiteDelete',
      ]);
    },
  );

  test('resetWebsite uses the same two-pass event-data cleanup before resetting the website', async () => {
    const calls: string[] = [];
    const tx = createDeleteTx(calls);

    transactionMock.mockImplementation(async callback => callback(tx));

    await resetWebsite('website-1');
    expect(tx.campaignLink.deleteMany).not.toHaveBeenCalled();
    expect(tx.campaignParameter.deleteMany).not.toHaveBeenCalled();
    expect(tx.websiteIpRule.deleteMany).not.toHaveBeenCalled();
    expect(tx.contentGroup.deleteMany).not.toHaveBeenCalled();
    expect(tx.eventRule.deleteMany).not.toHaveBeenCalled();

    expect(tx.eventData.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.heatmapEvent.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(1, 'SET search_path TO "public";');
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('website_event.website_id = $1'),
      'website-1',
    );
    expect(calls).toEqual([
      'sessionReplaySaved',
      'sessionReplay',
      'heatmapEvent',
      'revenue',
      'eventData',
      'rawSql',
      'rawSql',
      'sessionData',
      'sessionLink',
      'websiteEvent',
      'session',
      'websiteUpdate',
    ]);
  });
});
