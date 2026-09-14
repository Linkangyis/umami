import type { Metadata } from 'next';
import { getBrandMetadata } from '@/lib/branding-metadata';
import { AdminLayout } from './AdminLayout';

export default function ({ children }) {
  if (process.env.cloudMode) {
    return null;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

export async function generateMetadata(): Promise<Metadata> {
  return getBrandMetadata('管理');
}
