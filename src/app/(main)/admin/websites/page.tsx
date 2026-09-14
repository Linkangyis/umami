import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { AdminWebsitesPage } from './AdminWebsitesPage';

export default function () {
  return <AdminWebsitesPage />;
}
export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Websites');
}
