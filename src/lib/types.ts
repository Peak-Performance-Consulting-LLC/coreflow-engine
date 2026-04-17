import type { LucideIcon } from 'lucide-react';

export type CRMType =
  | 'real-estate'
  | 'gas-station'
  | 'convenience-store'
  | 'restaurant'
  | 'auto-repair';

export interface CRMOption {
  value: CRMType;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  crmType: CRMType;
  ownerId: string;
  role: string;
}

export interface DashboardPersonalization {
  headline: string;
  subheadline: string;
  statLabels: string[];
  quickActions: string[];
  activity: string[];
}

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  created_at: string;
}

export interface CompleteSignupPayload {
  full_name: string;
  workspace_name: string;
  workspace_slug: string;
  crm_type: CRMType;
}

export interface CompleteSignupResponse {
  workspace: WorkspaceSummary;
}

export interface WorkspaceLookupResponse {
  workspace: WorkspaceSummary | null;
}
