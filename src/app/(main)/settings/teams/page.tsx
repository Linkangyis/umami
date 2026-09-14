import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { TeamsSettingsPage } from './TeamsSettingsPage';

export default function () {
  return <TeamsSettingsPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Teams');
}
