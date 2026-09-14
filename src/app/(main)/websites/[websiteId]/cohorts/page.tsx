import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { CohortsPage } from './CohortsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <CohortsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Cohorts');
}
