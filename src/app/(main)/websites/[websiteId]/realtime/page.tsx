import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { RealtimePage } from './RealtimePage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RealtimePage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Real-time');
}
