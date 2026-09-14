import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { UserPage } from './UserPage';

export default async function ({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  return <UserPage userId={userId} />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('User');
}
