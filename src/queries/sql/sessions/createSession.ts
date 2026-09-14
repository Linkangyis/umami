import type { Prisma } from '@/generated/prisma/client';
import { FIELD_LENGTH } from '@/lib/constants';
import { truncateString } from '@/lib/format';
import prisma from '@/lib/prisma';
import { getStoredSessionIp } from '@/lib/session-ip';

const FUNCTION_NAME = 'createSession';

export async function createSession(data: Prisma.SessionCreateInput) {
  const { writeRawQuery } = prisma;
  const normalizedData: Prisma.SessionCreateInput = {
    ...data,
    ip: getStoredSessionIp(data.ip),
    browser: truncateString(data.browser, FIELD_LENGTH.browser),
    os: truncateString(data.os, FIELD_LENGTH.os),
    device: truncateString(data.device, FIELD_LENGTH.device),
    screen: truncateString(data.screen, FIELD_LENGTH.screen),
    language: truncateString(data.language, FIELD_LENGTH.language),
    country: truncateString(data.country, FIELD_LENGTH.country),
    region: truncateString(data.region, FIELD_LENGTH.region),
    city: truncateString(data.city, FIELD_LENGTH.city),
    distinctId: truncateString(data.distinctId, FIELD_LENGTH.distinctId),
  };

  await writeRawQuery(
    `
    insert into session (
      session_id,
      website_id,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      ip,
      distinct_id,
      created_at
    )
    values (
      {{id}},
      {{websiteId}},
      {{browser}},
      {{os}},
      {{device}},
      {{screen}},
      {{language}},
      {{country}},
      {{region}},
      {{city}},
      {{ip}},
      {{distinctId}},
      {{createdAt}}
    )
    on conflict (session_id) do update
      set ip = excluded.ip
      where session.website_id = excluded.website_id
        and session.ip is null
        and excluded.ip is not null
    `,
    normalizedData,
    FUNCTION_NAME,
  );
}
