# Verification Notes

## PostgreSQL timestamps and connection timezone

The installed `@prisma/adapter-pg` 7.9.1 requires UTC database sessions. Its date serializer sends UTC clock values without an offset, and its `timestamptz` parser replaces the database offset with UTC without adjusting the clock value.

A local rollback transaction using `SET LOCAL TIME ZONE 'Asia/Shanghai'` reproduced all three effects:

- A raw bound `Date` resolved 28,800 seconds before the intended instant.
- An ORM-written `createdAt` stored the same eight-hour error.
- Reading a timestamp literal with an explicit UTC offset returned a `Date` eight hours later.

`getPrismaPgConfig` now adds `-c timezone=UTC` to connection startup options for both primary and replica Prisma clients. It preserves other URL options and inherited `PGOPTIONS`. Putting this setting only in the Pool configuration is insufficient because `pg` gives URL options precedence. This change does not alter the database-wide timezone or any stored rows.

### Acceptance and rollout

1. Run `pnpm exec vitest run src/lib/prisma.test.ts` for configuration checks.
2. Set `UMAMI_TEST_DATABASE_URL` to a dedicated migrated PostgreSQL database and run `pnpm exec vitest run src/lib/prisma-timezone.test.ts`. This opt-in integration test rolls back its fixture. It checks startup UTC despite an explicit Shanghai option, preserves the statement timeout, and verifies raw and ORM timestamps against their absolute Unix time.
3. Rebuild and restart every application process so existing primary and replica pools reconnect. Verify `current_setting('TimeZone')` returns `UTC` through each application's actual connection, especially when a database proxy is involved. The integration check was run against local PostgreSQL 15.18; deployment verification remains necessary.
4. Scripts that create their own `PrismaPg` adapter, including the seed script, need a UTC connection separately. Do not seed a production database.

### Historical data

Do not apply a blanket eight-hour timestamp update. Explicitly supplied dates and database-generated `now()` defaults can have different histories, and old read conversion could conceal incorrectly stored values. The connection fix makes future writes and reads consistent but can expose pre-existing offsets in historical charts. Assess affected columns and periods using database Unix timestamps and an independent reference before proposing any historical correction. No historical timestamp migration is included.
