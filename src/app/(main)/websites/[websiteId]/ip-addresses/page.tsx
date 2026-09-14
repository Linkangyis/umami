import { getPageMetadata } from '@/lib/page-metadata';
import { IpAddressesPage } from './IpAddressesPage';

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <IpAddressesPage websiteId={websiteId} />;
}

export async function generateMetadata() {
  return getPageMetadata('IP analysis');
}
