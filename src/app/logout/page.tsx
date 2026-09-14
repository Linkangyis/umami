import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { LogoutPage } from './LogoutPage';

export const dynamic = 'force-dynamic';

export default function () {
  if (process.env.DISABLE_LOGIN || process.env.CLOUD_MODE) {
    return null;
  }

  return <LogoutPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Logout');
}
