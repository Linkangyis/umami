import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { ContentPage } from './ContentPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <ContentPage websiteId={websiteId} />;
}
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()).startsWith('zh') ? '内容分析' : 'Content analysis' };
}
