import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { ProfilePage } from './ProfilePage';

export default function () {
  return <ProfilePage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Profile');
}
