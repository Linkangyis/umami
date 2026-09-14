import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { TeamsPage } from './TeamsPage';

export default function () {
  return <TeamsPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Teams');
}
