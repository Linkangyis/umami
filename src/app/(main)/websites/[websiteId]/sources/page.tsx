import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { SourcesPage } from './SourcesPage';

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <SourcesPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Sources analysis');
}
