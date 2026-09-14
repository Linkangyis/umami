import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { TrafficPage } from './TrafficPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <TrafficPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Traffic analysis');
}
