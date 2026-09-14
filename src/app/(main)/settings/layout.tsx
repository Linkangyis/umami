import type { Metadata } from 'next';
import { getBrandMetadata } from '@/lib/branding-metadata';
import { SettingsLayout } from './SettingsLayout';

export default function ({ children }) {
  if (process.env.cloudMode) {
    return null;
  }

  return <SettingsLayout>{children}</SettingsLayout>;
}

export async function generateMetadata(): Promise<Metadata> {
  return getBrandMetadata('设置');
}
