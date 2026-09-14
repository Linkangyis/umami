import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { PixelsPage } from './PixelsPage';

export default function () {
  return <PixelsPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Pixels');
}
