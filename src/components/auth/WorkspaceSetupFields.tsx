import { CRMSelector } from '../ui/CRMSelector';
import { Input } from '../ui/Input';
import type { CRMType } from '../../lib/types';

interface WorkspaceSetupFieldsProps {
  workspaceName: string;
  workspaceSlug: string;
  crmType: CRMType;
  errors: Partial<Record<'workspaceName' | 'workspaceSlug' | 'crmType', string>>;
  onWorkspaceNameChange: (value: string) => void;
  onWorkspaceSlugChange: (value: string) => void;
  onCrmTypeChange: (crmType: CRMType) => void;
  singleColumn?: boolean;
  showSlugPreview?: boolean;
  slugPreviewPrefix?: string;
}

export function WorkspaceSetupFields({
  workspaceName,
  workspaceSlug,
  crmType,
  errors,
  onWorkspaceNameChange,
  onWorkspaceSlugChange,
  onCrmTypeChange,
  singleColumn = false,
  showSlugPreview = false,
  slugPreviewPrefix = '',
}: WorkspaceSetupFieldsProps) {
  const hasSlug = workspaceSlug.trim().length > 0;
  const previewUrl = `${slugPreviewPrefix}${workspaceSlug}`;

  return (
    <div className="space-y-5">
      <div className={`grid gap-5 ${singleColumn ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
        <Input
          label="Workspace name"
          placeholder="CoreFlow Ventures"
          value={workspaceName}
          onChange={(event) => onWorkspaceNameChange(event.target.value)}
          error={errors.workspaceName}
        />
        <Input
          label="Workspace slug"
          placeholder="coreflow-ventures"
          value={workspaceSlug}
          onChange={(event) => onWorkspaceSlugChange(event.target.value)}
          error={errors.workspaceSlug}
          hint="Use lowercase letters, numbers, and hyphens."
        />
      </div>

      {showSlugPreview && hasSlug ? (
        <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Workspace URL preview</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{previewUrl}</div>
        </div>
      ) : null}

      <CRMSelector
        value={crmType}
        onChange={onCrmTypeChange}
        error={errors.crmType}
        title="Choose your business type"
        subtitle="You can change this later"
      />
    </div>
  );
}
