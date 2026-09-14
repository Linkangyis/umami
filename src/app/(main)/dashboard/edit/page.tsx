import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { DashboardEditPage } from '../DashboardEditPage';

export default function () {
  return <DashboardEditPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Edit Dashboard');
}
