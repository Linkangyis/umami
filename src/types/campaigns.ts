import type { CampaignField, CampaignLinkInput } from '@/lib/campaigns';

export interface CampaignLink extends CampaignLinkInput {
  id: string;
  websiteId: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignParameter {
  id: string;
  websiteId: string;
  field: CampaignField;
  value: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLinksResponse {
  data: CampaignLink[];
  count: number;
  limit: number;
  canEdit: boolean;
}
export interface CampaignParametersResponse {
  data: CampaignParameter[];
  count: number;
  limit: number;
  canEdit: boolean;
}
