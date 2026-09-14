import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { RevenuePage } from './RevenuePage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RevenuePage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Revenue');
}
