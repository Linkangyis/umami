import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { LinksPage } from './LinksPage';

export default function () {
  return <LinksPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Links');
}
