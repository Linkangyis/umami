import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { DashboardViewPage } from './DashboardViewPage';

export default async function () {
  return <DashboardViewPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Dashboard');
}
