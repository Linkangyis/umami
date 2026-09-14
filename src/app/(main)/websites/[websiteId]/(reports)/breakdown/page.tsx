import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { BreakdownPage } from './BreakdownPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <BreakdownPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Insights');
}
