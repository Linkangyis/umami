import { cache } from 'react';
import {
  type AppBranding,
  brandingSchema,
  DEFAULT_BRANDING,
  sanitizeBranding,
} from '@/lib/branding';
import prisma from '@/lib/prisma';

export const BRANDING_SETTING_KEY = 'appBranding';

export async function getAppBranding(): Promise<AppBranding> {
  const setting = await prisma.client.appSetting.findUnique({
    where: { key: BRANDING_SETTING_KEY },
    select: { value: true },
  });
  try {
    return setting ? sanitizeBranding(JSON.parse(setting.value)) : { ...DEFAULT_BRANDING };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

export const getPublicAppBranding = cache(async () => {
  // Keep login and metadata available with defaults when the database is temporarily unavailable.
  return getAppBranding().catch(() => ({ ...DEFAULT_BRANDING }));
});

export async function saveAppBranding(value: AppBranding) {
  const branding = brandingSchema.parse(value);
  const data = JSON.stringify(branding);
  await prisma.client.appSetting.upsert({
    where: { key: BRANDING_SETTING_KEY },
    update: { value: data },
    create: { key: BRANDING_SETTING_KEY, value: data },
  });
  return branding;
}

export async function resetAppBranding() {
  await prisma.client.appSetting.deleteMany({ where: { key: BRANDING_SETTING_KEY } });
  return { ...DEFAULT_BRANDING };
}
