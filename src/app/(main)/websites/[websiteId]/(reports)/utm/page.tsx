import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { UTMPage } from './UTMPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <UTMPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('UTM Parameters');
}
