import type { CRMType } from './types';

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select';

export interface CrmStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string | null;
  is_closed: boolean;
  win_probability: number | null;
}

export interface CrmPipeline {
  id: string;
  name: string;
  is_default: boolean;
  stages: CrmStage[];
}

export interface RecordSource {
  id: string;
  name: string;
  source_type: string | null;
  is_active: boolean;
}

export interface WorkspaceAssignee {
  userId: string;
  role: string;
  fullName: string | null;
}

export interface CustomFieldDefinition {
  id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  is_required: boolean;
  options: string[] | null;
  placeholder: string | null;
  help_text: string | null;
  validation_rules: Record<string, unknown>;
  default_value: unknown;
  position: number;
}

export interface CrmWorkspaceConfig {
  pipelines: CrmPipeline[];
  sources: RecordSource[];
  customFields: CustomFieldDefinition[];
  assignees: WorkspaceAssignee[];
}

export interface RecordCore {
  id?: string;
  workspace_id: string;
  record_type?: string;
  title: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  assignee_user_id: string | null;
  status: string | null;
  priority: string | null;
  imported_from?: string | null;
  created_by?: string;
  updated_by?: string | null;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecordListCustomValues {
  [fieldKey: string]: unknown;
}

export interface RecordSummary extends RecordCore {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  custom?: RecordListCustomValues;
  next_follow_up_at?: string | null;
  next_task_title?: string | null;
  next_task_due_at?: string | null;
  last_activity_at?: string | null;
  last_activity_type?: string | null;
  open_task_count?: number;
}

export interface RecordNote {
  id: string;
  body: string;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordActivity {
  id: string;
  activity_type: string;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface RecordDetailResponse {
  record: RecordSummary;
  custom: Record<string, unknown>;
  notes: RecordNote[];
  tasks: RecordTask[];
  activities: RecordActivity[];
}

export interface RecordSaveInput {
  workspace_id: string;
  core: Partial<{
    title: string;
    full_name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    source_id: string | null;
    pipeline_id: string | null;
    stage_id: string | null;
    assignee_user_id: string | null;
    status: string | null;
    priority: string | null;
  }>;
  custom: Record<string, unknown>;
}

export interface RecordListFilters {
  workspace_id: string;
  search: string;
  stage_id: string | null;
  source_id: string | null;
  assignee_user_id: string | null;
  status: string | null;
  include_archived?: boolean;
}

export interface RecordListQuery extends RecordListFilters {
  page: number;
  pageSize: number;
}

export interface RecordListPageResult {
  items: RecordSummary[];
  records: RecordSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ImportMappingInput {
  source_column: string;
  target_type: 'core' | 'custom';
  target_key: string;
}

export interface ImportJobInput {
  workspace_id: string;
  entity_type?: 'record';
  file_name: string;
  preview_rows: Array<Record<string, unknown>>;
  mappings: ImportMappingInput[];
}

export interface RecordPageContext {
  crmType: CRMType;
}
