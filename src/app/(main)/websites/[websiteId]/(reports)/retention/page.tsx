import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { RetentionPage } from './RetentionPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <RetentionPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Retention');
}
