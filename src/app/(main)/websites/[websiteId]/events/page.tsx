import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { EventsPage } from './EventsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;

  return <EventsPage websiteId={websiteId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Events');
}
