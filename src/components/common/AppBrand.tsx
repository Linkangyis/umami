'use client';
import { Column, Heading, Row, Text } from '@umami/react-zen';
import { useState } from 'react';
import { useConfig } from '@/components/hooks/useConfig';
import { Logo } from '@/components/svg';
import { type AppBranding, DEFAULT_BRANDING } from '@/lib/branding';

export function AppBrand({
  branding,
  vertical = false,
}: {
  branding?: AppBranding;
  vertical?: boolean;
}) {
  const config = useConfig();
  const value = branding || config?.branding || DEFAULT_BRANDING;
  const [failedLogo, setFailedLogo] = useState('');
  const size = vertical ? 48 : 24;
  const logo =
    value.logoUrl && value.logoUrl !== failedLogo ? (
      <img
        src={value.logoUrl}
        alt={`${value.appName} logo`}
        width={size}
        height={size}
        onError={() => setFailedLogo(value.logoUrl)}
        style={{ objectFit: 'contain', flexShrink: 0 }}
      />
    ) : (
      <Logo width={size} height={size} role="img" aria-label={`${value.appName} logo`} />
    );

  return vertical ? (
    <Column alignItems="center" gap="4" data-test="app-brand">
      {logo}
      <Heading style={{ maxWidth: 360, textAlign: 'center', overflowWrap: 'anywhere' }}>
        {value.appName}
      </Heading>
    </Column>
  ) : (
    <Row
      alignItems="center"
      gap="2"
      data-test="app-brand"
      style={{ minWidth: 0, maxWidth: '100%' }}
    >
      {logo}
      <Text
        weight="bold"
        title={value.appName}
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
      >
        {value.appName}
      </Text>
    </Row>
  );
}
