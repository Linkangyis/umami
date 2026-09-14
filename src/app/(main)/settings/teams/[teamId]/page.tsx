import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { TeamSettingsPage } from './TeamSettingsPage';

export default async function ({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  return <TeamSettingsPage teamId={teamId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Teams');
}
