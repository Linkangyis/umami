import { expect, test, vi } from 'vitest';
import { ENTITY_TYPE } from '@/lib/constants';
import {
  canViewAuthenticatedWebsite,
  canViewSharedWebsite,
  canViewSharedWebsiteFilters,
  canViewWebsiteSection,
} from './share';
import { canViewWebsite } from './website';

vi.mock('./website', () => ({
  canViewWebsite: vi.fn(),
}));

test('authenticated-only data cannot be unlocked by combining an unrelated login and share token', async () => {
  vi.mocked(canViewWebsite).mockClear();
  expect(
    await canViewAuthenticatedWebsite(
      { user: { id: 'unrelated' } as any, shareToken: { websiteId: 'shared-site' } },
      'shared-site',
    ),
  ).toBe(false);
  expect(canViewWebsite).not.toHaveBeenCalled();
  vi.mocked(canViewWebsite).mockResolvedValue(true);
  const auth = { user: { id: 'owner' } as any };
  expect(await canViewAuthenticatedWebsite(auth, 'owned-site')).toBe(true);
  expect(canViewWebsite).toHaveBeenCalledWith(auth, 'owned-site');
});

test('canViewWebsiteSection allows board shares for included websites', async () => {
  await expect(
    canViewWebsiteSection(
      {
        shareToken: {
          shareType: ENTITY_TYPE.board,
          websiteIds: ['website-1'],
          parameters: {},
        },
      },
      'website-1',
      'goals',
    ),
  ).resolves.toBe(true);
});

test('canViewWebsiteSection respects section flags on website shares', async () => {
  await expect(
    canViewWebsiteSection(
      {
        shareToken: {
          shareType: ENTITY_TYPE.website,
          websiteId: 'website-1',
          parameters: {
            overview: true,
            goals: false,
          },
        },
      },
      'website-1',
      'goals',
    ),
  ).resolves.toBe(false);
});

test('a login alongside a share token does not bypass restricted sections or filters', async () => {
  const auth = {
    user: { id: 'unrelated' } as any,
    shareToken: {
      websiteId: 'website-1',
      parameters: { overview: false, sessions: true, allowFilter: false },
    },
  };
  expect(await canViewWebsiteSection(auth, 'website-1', 'overview')).toBe(false);
  expect(await canViewWebsiteSection(auth, 'website-1', 'sessions')).toBe(true);
  expect(await canViewSharedWebsiteFilters(auth, 'website-1')).toBe(false);
  expect(await canViewSharedWebsite(auth, 'another-site')).toBe(false);
});

test('canViewWebsiteSection allows any requested enabled section', async () => {
  await expect(
    canViewWebsiteSection(
      {
        shareToken: {
          shareType: ENTITY_TYPE.website,
          websiteId: 'website-1',
          parameters: {
            overview: true,
            compare: false,
          },
        },
      },
      'website-1',
      ['overview', 'compare'],
    ),
  ).resolves.toBe(true);
});

test('canViewSharedWebsite allows board shares for included websites', async () => {
  await expect(
    canViewSharedWebsite(
      {
        shareToken: {
          shareType: ENTITY_TYPE.board,
          websiteIds: ['website-1'],
          parameters: {},
        },
      },
      'website-1',
    ),
  ).resolves.toBe(true);
});

test('canViewSharedWebsiteFilters requires allowFilter for share tokens', async () => {
  await expect(
    canViewSharedWebsiteFilters(
      {
        shareToken: {
          shareType: ENTITY_TYPE.website,
          websiteId: 'website-1',
          parameters: {
            allowFilter: false,
          },
        },
      },
      'website-1',
    ),
  ).resolves.toBe(false);

  await expect(
    canViewSharedWebsiteFilters(
      {
        shareToken: {
          shareType: ENTITY_TYPE.website,
          websiteId: 'website-1',
          parameters: {
            allowFilter: true,
          },
        },
      },
      'website-1',
    ),
  ).resolves.toBe(true);
});

test('canViewWebsiteSection allows pixel shares for the shared entity id', async () => {
  await expect(
    canViewWebsiteSection(
      {
        shareToken: {
          shareType: ENTITY_TYPE.pixel,
          pixelId: 'pixel-1',
          parameters: {
            overview: true,
          },
        },
      },
      'pixel-1',
      'overview',
    ),
  ).resolves.toBe(true);
});

test('canViewWebsiteSection allows link shares for the shared entity id', async () => {
  await expect(
    canViewWebsiteSection(
      {
        shareToken: {
          shareType: ENTITY_TYPE.link,
          linkId: 'link-1',
          parameters: {
            overview: true,
          },
        },
      },
      'link-1',
      'overview',
    ),
  ).resolves.toBe(true);
});
