import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { AdminTeamsPage } from './AdminTeamsPage';

export default function () {
  return <AdminTeamsPage />;
}
export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Teams');
}
