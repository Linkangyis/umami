import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { SessionsPage } from './SessionsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <SessionsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Sessions');
}
