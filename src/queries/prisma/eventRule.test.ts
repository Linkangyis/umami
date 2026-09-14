import { beforeEach, expect, test, vi } from 'vitest';
import {
  createEventRule,
  deleteEventRule,
  EventRuleLimitError,
  getPublicEventRules,
  updateEventRule,
} from './eventRule';

const { tx } = vi.hoisted(() => ({
  tx: {
    $queryRawUnsafe: vi.fn(),
    eventRule: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/prisma', () => ({
  default: { client: tx, transaction: (fn: (value: typeof tx) => unknown) => fn(tx) },
  getSchema: () => 'public',
}));
vi.mock('@/lib/crypto', () => ({ uuid: () => 'new-rule-id' }));

const data = {
  name: 'Buy',
  selector: '#buy',
  urlPath: '/?products/',
  matchType: 'exact' as const,
  eventType: 'click' as const,
  isEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.$queryRawUnsafe.mockResolvedValue([{ website_id: 'site-1' }]);
  tx.eventRule.count.mockResolvedValue(0);
  tx.eventRule.updateMany.mockResolvedValue({ count: 0 });
  tx.eventRule.findMany.mockResolvedValue([]);
});

test('locks the owning website before counting and inserting rules', async () => {
  await createEventRule('site-1', data);
  expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('for update'), 'site-1');
  expect(tx.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
    tx.eventRule.count.mock.invocationCallOrder[0],
  );
  expect(tx.eventRule.create).toHaveBeenCalledWith({
    data: { ...data, id: 'new-rule-id', websiteId: 'site-1' },
  });
});

test('blocks rule 101 and never writes when the cap is reached', async () => {
  tx.eventRule.count.mockResolvedValue(100);
  await expect(createEventRule('site-1', data)).rejects.toBeInstanceOf(EventRuleLimitError);
  expect(tx.eventRule.create).not.toHaveBeenCalled();
});

test('scopes every update and delete by both website and rule identity', async () => {
  expect(await updateEventRule('site-1', 'other-site-rule', { name: 'Changed' })).toBeNull();
  expect(tx.eventRule.updateMany).toHaveBeenCalledWith({
    where: { id: 'other-site-rule', websiteId: 'site-1', website: { deletedAt: null } },
    data: { name: 'Changed' },
  });
  expect(tx.eventRule.findFirst).not.toHaveBeenCalled();
  await deleteEventRule('site-1', 'other-site-rule');
  expect(tx.eventRule.deleteMany).toHaveBeenCalledWith({
    where: { id: 'other-site-rule', websiteId: 'site-1' },
  });
});

test('public collection selects only enabled rules on active sites and safe tracker fields', async () => {
  tx.eventRule.findMany.mockResolvedValue([
    { id: 'match', ...data },
    { id: 'other', ...data, urlPath: '/other' },
  ]);
  const result = await getPublicEventRules(
    'site-1',
    'https://shop.example/?products/&utm_source=mail',
  );
  expect(result.map(rule => rule.id)).toEqual(['match']);
  expect(tx.eventRule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { websiteId: 'site-1', isEnabled: true, website: { deletedAt: null } },
      take: 100,
      select: {
        id: true,
        name: true,
        selector: true,
        urlPath: true,
        matchType: true,
        eventType: true,
      },
    }),
  );
});
