import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { UserSecurityPage } from './UserSecurityPage';

export default function () {
  return <UserSecurityPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Security');
}
