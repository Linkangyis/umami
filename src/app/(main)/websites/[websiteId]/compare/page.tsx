import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { ComparePage } from './ComparePage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <ComparePage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Compare');
}
