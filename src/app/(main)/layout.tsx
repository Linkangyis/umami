import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getBrandMetadata } from '@/lib/branding-metadata';
import { App } from './App';

export default function ({ children }) {
  return (
    <Suspense>
      <App>{children}</App>
    </Suspense>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getBrandMetadata();
}
