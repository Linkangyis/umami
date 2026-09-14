import type { Metadata } from 'next';
import { BrandingPage } from './BrandingPage';

export default function Page() {
  return <BrandingPage />;
}

export const metadata: Metadata = { title: '品牌设置' };
