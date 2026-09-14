import type { Metadata } from 'next';
import { WebsiteSettingsPage } from '@/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage';
import { getPageMetadata } from '@/lib/page-metadata';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <WebsiteSettingsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Website');
}
