import { beforeEach, expect, test, vi } from 'vitest';
import { getCollectorWebsite } from './collectorWebsite';

const { primaryFind, replicaFind } = vi.hoisted(() => ({
  primaryFind: vi.fn(),
  replicaFind: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      website: { findFirst: replicaFind },
      $primary: () => ({ website: { findFirst: primaryFind } }),
    },
  },
}));
beforeEach(() => vi.clearAllMocks());

test('reads only active collector policy from the primary, never a stale replica', async () => {
  primaryFind.mockResolvedValue({ id: 'site', recorderEnabled: false });
  expect(await getCollectorWebsite('site')).toEqual({ id: 'site', recorderEnabled: false });
  expect(primaryFind).toHaveBeenCalledWith({
    where: { id: 'site', deletedAt: null },
    select: { id: true, recorderEnabled: true, replayConfig: true, userId: true, teamId: true },
  });
  expect(replicaFind).not.toHaveBeenCalled();
  primaryFind.mockResolvedValue(null);
  expect(await getCollectorWebsite('deleted-site')).toBeNull();
});
