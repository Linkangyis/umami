import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { WebsitesPage } from './WebsitesPage';

export default function () {
  return <WebsitesPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Websites');
}
