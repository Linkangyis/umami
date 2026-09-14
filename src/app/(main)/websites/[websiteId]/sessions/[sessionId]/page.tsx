import type { Metadata } from 'next';
import { SessionProfile } from '@/app/(main)/websites/[websiteId]/sessions/SessionProfile';
import { getPageMetadata } from '@/lib/page-metadata';

export default async function ({
  params,
}: {
  params: Promise<{ websiteId: string; sessionId: string }>;
}) {
  const { websiteId, sessionId } = await params;

  return <SessionProfile websiteId={websiteId} sessionId={sessionId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Session');
}
