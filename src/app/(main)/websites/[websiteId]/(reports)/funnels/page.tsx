import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { FunnelsPage } from './FunnelsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <FunnelsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Funnels');
}
