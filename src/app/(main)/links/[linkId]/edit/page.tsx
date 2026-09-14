import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { getLink } from '@/queries/prisma';
import { LinkEditPage } from './LinkEditPage';

export default async function ({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const link = await getLink(linkId);

  if (!link || link.deletedAt) {
    return null;
  }

  return <LinkEditPage linkId={linkId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Edit Link');
}
