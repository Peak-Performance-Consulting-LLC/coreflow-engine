import type { CRMType, WorkspaceRole } from './types';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multi_select';

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
  role: WorkspaceRole;
  fullName: string | null;
}

export interface CustomFieldDefinition {
  id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  is_required: boolean;
  is_active: boolean;
  is_system?: boolean;
  options: string[] | null;
  placeholder: string | null;
  help_text: string | null;
  validation_rules: Record<string, unknown>;
  default_value: unknown;
  position: number;
}

export interface CustomFieldDefinitionInput {
  id?: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  is_required: boolean;
  is_active?: boolean;
  options: string[] | null;
  placeholder: string | null;
  help_text: string | null;
  validation_rules: Record<string, unknown>;
  default_value: unknown;
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
  semantic_id?: string | null;
  target_type: 'core' | 'custom';
  target_key: string;
  confidence?: number | null;
  status?: 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed';
  mapping_source?: 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none';
  notes?: string | null;
}

export interface ImportJobInput {
  workspace_id: string;
  entity_type?: 'record';
  file_name: string;
  source_fingerprint?: string;
  profile_id?: string | null;
  rows: Array<Record<string, unknown>>;
  mappings: ImportMappingInput[];
}

export interface ImportJobResult {
  job: {
    id: string;
    file_name: string;
    status: string;
    total_rows: number | null;
    success_rows: number | null;
    failed_rows: number | null;
    created_at: string;
    updated_at: string;
  };
  importExecutionImplemented: boolean;
  totalRows: number;
  importedCount: number;
  failedCount: number;
  failures: Array<{
    rowIndex: number;
    error: string;
  }>;
  message: string;
}

export interface RecordPageContext {
  crmType: CRMType;
}

export interface ImportMappingSuggestion {
  source_column: string;
  semantic_id: string | null;
  semantic_key: string | null;
  target_type: 'core' | 'custom' | null;
  target_key: string | null;
  confidence: number;
  status: 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed';
  mapping_source: 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none';
  notes: string | null;
  sample_values: string[];
}

export interface ImportAnalyzeInput {
  workspace_id: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export interface ImportAnalyzeResult {
  workspace_id: string;
  crm_type: CRMType | string;
  source_fingerprint: string;
  profile: {
    id: string;
    profile_name: string;
    source_fingerprint: string;
    mappings: Array<{
      source_column: string;
      semantic_id: string | null;
      target_type: 'core' | 'custom';
      target_key: string;
      confidence: number | null;
    }>;
  } | null;
  suggestions: ImportMappingSuggestion[];
  required_missing_targets: string[];
  needs_confirmation_count: number;
  new_semantic_count: number;
}

export interface ImportMappingApproveInput {
  workspace_id: string;
  mappings: ImportMappingInput[];
  create_fields?: Array<{
    source_column: string;
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    options?: string[];
    is_required?: boolean;
    placeholder?: string | null;
    help_text?: string | null;
  }>;
}

export interface ImportMappingApproveResult {
  workspace_id: string;
  mappings: ImportMappingInput[];
  missing_required_targets: string[];
  created_custom_fields: string[];
  message: string;
}

export interface ImportProfileSaveInput {
  workspace_id: string;
  columns?: string[];
  source_fingerprint?: string;
  profile_name?: string;
  is_default?: boolean;
  mappings: ImportMappingInput[];
}

export interface ImportIntelligenceSemantic {
  id: string;
  semantic_key: string;
  label: string;
  description: string | null;
}

export interface ImportIntelligenceAlias {
  id?: string;
  semantic_id: string;
  alias_text: string;
  weight: number;
  scope: 'crm' | 'workspace';
}

export interface ImportIntelligenceBinding {
  id?: string;
  semantic_id: string;
  target_type: 'core' | 'custom';
  target_key: string;
  is_required: boolean;
  scope: 'crm' | 'workspace';
}

export interface ImportIntelligenceTransformRule {
  id?: string;
  target_type: 'core' | 'custom';
  target_key: string;
  rule_type: 'date' | 'number' | 'boolean' | 'enum' | 'phone' | 'currency';
  rule_config: Record<string, unknown>;
  scope: 'crm' | 'workspace';
}

export interface ImportIntelligenceOptionAlias {
  id?: string;
  field_key: string;
  alias_value: string;
  canonical_value: string;
  scope: 'crm' | 'workspace';
}

export interface ImportIntelligenceConfigResult {
  workspace_id: string;
  crm_type: string;
  semantics: ImportIntelligenceSemantic[];
  aliases: Array<ImportIntelligenceAlias & { workspace_id?: string | null; crm_type?: string | null }>;
  bindings: Array<ImportIntelligenceBinding & { workspace_id?: string | null; crm_type?: string | null }>;
  transform_rules: Array<ImportIntelligenceTransformRule & { workspace_id?: string | null; crm_type?: string | null }>;
  option_aliases: Array<ImportIntelligenceOptionAlias & { workspace_id?: string | null; crm_type?: string | null }>;
  custom_fields: Array<{
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    is_required: boolean;
  }>;
}

export interface ImportIntelligenceConfigSaveInput {
  workspace_id: string;
  clear_scope?: 'all';
  aliases: ImportIntelligenceAlias[];
  bindings: ImportIntelligenceBinding[];
  transform_rules: ImportIntelligenceTransformRule[];
  option_aliases: ImportIntelligenceOptionAlias[];
}
