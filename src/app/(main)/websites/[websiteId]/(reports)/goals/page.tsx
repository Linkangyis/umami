import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { GoalsPage } from './GoalsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <GoalsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Goals');
}
