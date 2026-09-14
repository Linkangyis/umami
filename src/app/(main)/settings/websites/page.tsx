import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { WebsitesSettingsPage } from './WebsitesSettingsPage';

export default async function ({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  return <WebsitesSettingsPage teamId={teamId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Websites');
}
