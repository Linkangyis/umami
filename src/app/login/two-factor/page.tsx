import type { Metadata } from 'next';
import { LoginPageWrapper } from '@/app/login/LoginPage';
import { getPageMetadata } from '@/lib/page-metadata';
import { LoginTwoFactorPage } from './LoginTwoFactorPage';

export default async function () {
  if (process.env.DISABLE_LOGIN || process.env.CLOUD_MODE) {
    return null;
  }

  return (
    <LoginPageWrapper>
      <LoginTwoFactorPage />
    </LoginPageWrapper>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getPageMetadata('Two-factor authentication');
}
