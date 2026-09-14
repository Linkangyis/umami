import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { HeatmapsPage } from './HeatmapsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <HeatmapsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Heatmaps');
}
