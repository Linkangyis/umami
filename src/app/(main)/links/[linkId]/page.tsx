import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { getLink } from '@/queries/prisma';
import { LinkPage } from './LinkPage';

export default async function ({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const link = await getLink(linkId);

  if (!link || link?.deletedAt) {
    return null;
  }

  return <LinkPage linkId={linkId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Link');
}
