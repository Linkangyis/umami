import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { EngagementPage } from './EngagementPage';

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <EngagementPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Visitor engagement');
}
