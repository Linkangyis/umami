import type { Metadata } from 'next';
import { getBrandTitle } from '@/lib/branding';
import { getPublicAppBranding } from '@/queries/prisma/branding';

export async function getBrandMetadata(section?: string, defaultPage?: string): Promise<Metadata> {
  const name = getBrandTitle(await getPublicAppBranding());
  return {
    title: {
      template: ['%s', section, name].filter(Boolean).join(' | '),
      default: [defaultPage || section, name].filter(Boolean).join(' | '),
    },
  };
}
