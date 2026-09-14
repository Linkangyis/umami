import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { SegmentsPage } from './SegmentsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <SegmentsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Segments');
}
