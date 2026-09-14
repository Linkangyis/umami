import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { WebsiteSettingsPage } from './WebsiteSettingsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <WebsiteSettingsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Website');
}
