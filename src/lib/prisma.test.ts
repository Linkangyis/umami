import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/umami?schema=public';
delete process.env.DATABASE_REPLICA_URL;

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {},
}));

vi.mock('@prisma/extension-read-replicas', () => ({
  readReplicas: () => () => ({}),
}));

vi.mock('@/generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {
    $executeRawUnsafe = vi.fn();
    $queryRawUnsafe = vi.fn();
    $transaction = vi.fn();
    $on = vi.fn();
    $extends() {
      return this;
    }
  },
}));

let getRawQueryClient!: typeof import('./prisma').getRawQueryClient;
let getPrismaPgConfig!: typeof import('./prisma').getPrismaPgConfig;

beforeAll(async () => {
  ({ getRawQueryClient, getPrismaPgConfig } = await import('./prisma'));
});

afterEach(() => vi.unstubAllEnvs());

describe('getPrismaPgConfig', () => {
  test('sets UTC at connection startup and preserves existing URL options and schema', () => {
    const source = new URL(
      'postgresql://user:pass@localhost:5432/umami?schema=analytics&sslmode=require',
    );
    source.searchParams.set('options', '-c statement_timeout=10000 -c timezone=Asia/Shanghai');
    const config = getPrismaPgConfig(source.toString());
    const result = new URL(config.connectionString);

    expect(result.searchParams.get('options')).toBe(
      '-c statement_timeout=10000 -c timezone=Asia/Shanghai -c timezone=UTC',
    );
    expect(result.searchParams.get('schema')).toBe('analytics');
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.username).toBe(source.username);
    expect(result.password).toBe(source.password);
    expect(result.host).toBe(source.host);
  });

  test('retains inherited PGOPTIONS while enforcing UTC and leaves the environment untouched', () => {
    vi.stubEnv('PGOPTIONS', '-c statement_timeout=20000 -c timezone=Asia/Hong_Kong');
    const result = new URL(
      getPrismaPgConfig('postgresql://user:pass@localhost/umami').connectionString,
    );

    expect(result.searchParams.get('options')).toBe(
      '-c statement_timeout=20000 -c timezone=Asia/Hong_Kong -c timezone=UTC',
    );
    expect(process.env.PGOPTIONS).toBe('-c statement_timeout=20000 -c timezone=Asia/Hong_Kong');
  });
});

interface RawQueryClient {
  $executeRawUnsafe: (query: string, ...params: any[]) => unknown;
  $queryRawUnsafe: (query: string, ...params: any[]) => unknown;
  $primary?: () => unknown;
  $replica?: () => unknown;
}

function createClient(): RawQueryClient {
  return {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  };
}

describe('getRawQueryClient', () => {
  test('uses a replica client for read queries when replicas are enabled', () => {
    const replica = createClient();
    const client = {
      ...createClient(),
      $replica: vi.fn(() => replica),
    };

    expect(getRawQueryClient(client, { useReplica: true })).toBe(replica);
  });

  test('keeps read queries on the primary client when replicas are disabled', () => {
    const client = {
      ...createClient(),
      $replica: vi.fn(() => createClient()),
    };

    expect(getRawQueryClient(client, { useReplica: false })).toBe(client);
  });

  test('uses the primary client for raw writes when available', () => {
    const primary = createClient();
    const client = {
      ...createClient(),
      $primary: vi.fn(() => primary),
      $replica: vi.fn(() => createClient()),
    };

    expect(getRawQueryClient(client, { useReplica: true, write: true })).toBe(primary);
  });

  test('falls back to the current client for raw writes without a primary helper', () => {
    const client = createClient();

    expect(getRawQueryClient(client, { write: true })).toBe(client);
  });
});
