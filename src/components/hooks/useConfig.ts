import { useEffect } from 'react';
import { useApi } from '@/components/hooks/useApi';
import type { AppBranding } from '@/lib/branding';
import { setConfig, useApp } from '@/store/app';

export type Config = {
  branding?: AppBranding;
  cloudMode: boolean;
  faviconUrl?: string;
  linksUrl?: string;
  pixelsUrl?: string;
  privateMode: boolean;
  sessionDeletionEnabled: boolean;
  scriptVersions?: { tracker?: string; recorder?: string };
  telemetryDisabled: boolean;
  trackerScriptName?: string;
  updatesDisabled: boolean;
};

export function useConfig(): Config {
  const { config } = useApp();
  const { get, useQuery } = useApi();
  const { data } = useQuery<Config>({
    queryKey: ['config'],
    queryFn: () => get('/config'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  return config || data;
}
