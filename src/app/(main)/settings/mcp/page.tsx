import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/page-metadata';
import { McpSettingsPage } from './McpSettingsPage';

export default function Page() {
  return <McpSettingsPage />;
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('MCP');
}
