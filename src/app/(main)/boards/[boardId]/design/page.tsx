import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { BoardDesignPage } from '../BoardEditPage';

export default async function ({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;

  return <BoardDesignPage boardId={boardId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Design Board');
}
