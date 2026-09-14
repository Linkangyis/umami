# Verification Notes

## Browser script updates and CDN caches

`/script.js`, `/recorder.js`, and configured local tracker aliases use `public, max-age=0, s-maxage=60, must-revalidate`: browsers revalidate and shared caches have a 60-second freshness window when origin directives are respected. These mutable URLs are never marked immutable.

`/api/config` publishes `scriptVersions`, combining the package version with the SHA-256 content digest of each deployed script. Generated embed codes add that stable value as `?v=...`. Repeated views do not change the version; changing script bytes does, including runtime `COLLECT_API_ENDPOINT` replacement. Other query parameters, base paths, website IDs, and collector behavior are preserved. External and cloud script overrides keep their original URLs because local content cannot identify those files.

After deployment, compare the origin and public script content and confirm the new embed URLs fetch the expected bytes. A previously cached response keeps its old TTL until expiry or purge; changing origin headers cannot evict it retroactively. Purge the exact mutable script URLs once when replacing the old one-day policy, or install newly generated versioned embed codes. Confirm CDN rules respect origin cache directives and include query strings in cache keys; an overriding CDN rule can supersede this application policy. See [Cloudflare origin cache control](https://developers.cloudflare.com/cache/concepts/cache-control/).

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

## IP analysis and collector exclusions

`IP_TEST_DATABASE=1` opts into `getIpAnalytics.integration.test.ts`; the test additionally checks that the database is the dedicated loopback `umami_dev` instance on port 55432. It creates isolated fixtures and verifies composite visit identity, full-visit pageview filters, missing-IP coverage, literal IP searching, pagination, cross-website isolation, immediate enable/disable/delete behavior, and concurrent enforcement of the 200-rule limit.

`tests/e2e/ip-addresses.spec.ts` verifies an actual cached tracker session is blocked after rule creation and resumes after disable/delete. It also covers CSV contents, normalized CIDR display, retaining notes during partial updates, `no-store` responses, unauthenticated denial, desktop/mobile layout, and invalid DOM-prop warnings. Use Node 22 and an independent Playwright `--output` directory when running tests in parallel.

Collector tests cover both heatmap and replay writes and reject cross-website cache tokens before loading or writing the target website. Raw IP APIs reject share context even when combined with an unrelated completed login. PostgreSQL groups by the IP retained on the session; ClickHouse assigns each visit its latest nonempty recorded IP. Both report coverage separately and never reconstruct unavailable historical addresses. Real ClickHouse execution remains unverified.

The final IP ordering is performed in SQL after the summary/rows union, using the same collation as pagination. PostgreSQL tests concatenate pages and compare them with the full result across IPv4/IPv6 addresses, all five sort fields and both directions; JavaScript does not reorder a page using another locale.

Collectors read active website policy from the primary on every request, independently of a valid cached tracking token. Synthetic HTTP checks confirm both soft-deleted and hard-deleted websites reject cached pageviews and nonempty recording chunks. `Forwarded` parsing now respects quoted fields, IPv6 brackets/ports and the original header priority; an unknown first hop is never replaced by a later proxy. Resetting analytics preserves event bindings, content groups, campaigns, parameter dictionaries and IP rules; hard/soft website deletion cleans these configurations.
