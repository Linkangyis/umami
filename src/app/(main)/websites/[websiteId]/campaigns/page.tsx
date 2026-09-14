import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { CampaignsPage } from './CampaignsPage';

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <CampaignsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Campaign links');
}
