import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { LoginPage } from './LoginPage';

export const dynamic = 'force-dynamic';

export default async function () {
  if (process.env.DISABLE_LOGIN || process.env.CLOUD_MODE) {
    return null;
  }

  return <LoginPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Login');
}
