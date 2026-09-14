import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { ReplaysPage } from './ReplaysPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <ReplaysPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Replays');
}
