import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { UsersPage } from './UsersPage';

export default function () {
  return <UsersPage />;
}
export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Users');
}
