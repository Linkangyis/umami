import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { SettingsPage } from './SettingsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <SettingsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Settings');
}
