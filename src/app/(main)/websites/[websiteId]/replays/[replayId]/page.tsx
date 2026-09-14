import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { ReplayPlayback } from './ReplayPlayback';

export default async function ({
  params,
}: {
  params: Promise<{ websiteId: string; replayId: string }>;
}) {
  const { websiteId, replayId } = await params;

  return <ReplayPlayback websiteId={websiteId} replayId={replayId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Session Replay');
}
