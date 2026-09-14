import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { PerformancePage } from './PerformancePage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <PerformancePage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Performance');
}
