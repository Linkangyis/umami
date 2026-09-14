import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { PreferencesPage } from './PreferencesPage';

export default function () {
  return <PreferencesPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Preferences');
}
