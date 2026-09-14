import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getUser, getUserByUsername } from './user';

const { findUniqueMock, primaryFindUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  primaryFindUniqueMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      $primary: () => ({ user: { findUnique: primaryFindUniqueMock } }),
      user: {
        findUnique: findUniqueMock,
      },
    },
  },
}));

describe('getUserByUsername', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    primaryFindUniqueMock.mockReset();
    findUniqueMock.mockResolvedValue(null);
  });

  test('reads authentication data from the primary client without consulting the replica', async () => {
    primaryFindUniqueMock.mockResolvedValue({ id: 'user-1', password: 'current-hash' });
    const user = await getUser('user-1', { includePassword: true, usePrimary: true });
    expect(user).toMatchObject({ id: 'user-1', password: 'current-hash' });
    expect(primaryFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', deletedAt: null },
        select: expect.objectContaining({ password: true }),
      }),
    );
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  test('normalizes usernames to lowercase before lookup', async () => {
    await getUserByUsername('KaKi87', { includePassword: true });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        username: 'kaki87',
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        createdAt: true,
        twoFactorRequired: true,
      },
    });
  });

  test('can include deleted users while still lowercasing the username', async () => {
    await getUserByUsername('KaKi87', { showDeleted: true });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        username: 'kaki87',
      },
      select: {
        id: true,
        username: true,
        password: false,
        role: true,
        createdAt: true,
        twoFactorRequired: true,
      },
    });
  });
});
