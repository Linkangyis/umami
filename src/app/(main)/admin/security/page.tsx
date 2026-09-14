import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { AdminSecurityPage } from './AdminSecurityPage';

export default function () {
  return <AdminSecurityPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Security');
}
