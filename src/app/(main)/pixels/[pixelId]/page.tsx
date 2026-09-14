import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { getPixel } from '@/queries/prisma';
import { PixelPage } from './PixelPage';

export default async function ({ params }: { params: { pixelId: string } }) {
  const { pixelId } = await params;
  const pixel = await getPixel(pixelId);

  if (!pixel || pixel?.deletedAt) {
    return null;
  }

  return <PixelPage pixelId={pixelId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Pixel');
}
