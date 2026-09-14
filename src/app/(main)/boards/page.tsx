import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { BoardsPage } from './BoardsPage';

export default function () {
  return <BoardsPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Boards');
}
