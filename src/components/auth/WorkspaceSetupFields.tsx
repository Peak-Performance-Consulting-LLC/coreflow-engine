import { motion } from 'framer-motion';
import { CRMSelector } from '../ui/CRMSelector';
import { Input } from '../ui/Input';
import type { CRMType } from '../../lib/types';
import { cn } from '../../lib/utils';

interface WorkspaceSetupFieldsProps {
  workspaceName: string;
  workspaceSlug: string;
  crmType: CRMType;
  guideIds?: Partial<Record<'workspaceName' | 'workspaceSlug' | 'crmType', string>>;
  errors: Partial<Record<'workspaceName' | 'workspaceSlug' | 'crmType', string>>;
  onWorkspaceNameChange: (value: string) => void;
  onWorkspaceSlugChange: (value: string) => void;
  onCrmTypeChange: (crmType: CRMType) => void;
  singleColumn?: boolean;
  showSlugPreview?: boolean;
  slugPreviewPrefix?: string;
  variant?: 'default' | 'launch';
}

export function WorkspaceSetupFields({
  workspaceName,
  workspaceSlug,
  crmType,
  guideIds,
  errors,
  onWorkspaceNameChange,
  onWorkspaceSlugChange,
  onCrmTypeChange,
  singleColumn = false,
  showSlugPreview = false,
  slugPreviewPrefix = '',
  variant = 'default',
}: WorkspaceSetupFieldsProps) {
  const hasSlug = workspaceSlug.trim().length > 0;
  const previewUrl = `${slugPreviewPrefix}${workspaceSlug}`;
  const isLaunch = variant === 'launch';

  return (
    <div className={cn('space-y-3.5', isLaunch && 'space-y-4')}>
      <div className={`grid gap-3.5 ${singleColumn ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
        {[
          {
            key: 'name',
            node: (
              <Input
                label="Workspace name"
                data-guide-id={guideIds?.workspaceName}
                placeholder="CoreFlow Ventures"
                value={workspaceName}
                onChange={(event) => onWorkspaceNameChange(event.target.value)}
                error={errors.workspaceName}
              />
            ),
          },
          {
            key: 'slug',
            node: (
              <Input
                label="Workspace slug"
                data-guide-id={guideIds?.workspaceSlug}
                placeholder="coreflow-ventures"
                value={workspaceSlug}
                onChange={(event) => onWorkspaceSlugChange(event.target.value)}
                error={errors.workspaceSlug}
                hint="Use lowercase letters, numbers, and hyphens."
              />
            ),
          },
        ].map((field, index) => (
          <motion.div
            key={field.key}
            className={cn(isLaunch && 'relative rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur')}
            initial={isLaunch ? { opacity: 0, y: 16, rotateX: -8 } : false}
            animate={isLaunch ? { opacity: 1, y: 0, rotateX: 0 } : undefined}
            transition={{ delay: 0.1 + index * 0.08, duration: 0.45 }}
            whileHover={isLaunch ? { y: -3, scale: 1.01 } : undefined}
          >
            {isLaunch ? (
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent"
                initial={{ x: '-120%' }}
                animate={{ x: ['-120%', '120%'] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.6 }}
              />
            ) : null}
            <div className="relative">{field.node}</div>
          </motion.div>
        ))}
      </div>

      {showSlugPreview && hasSlug ? (
        <motion.div
          initial={isLaunch ? { opacity: 0, scale: 0.96 } : false}
          animate={isLaunch ? { opacity: 1, scale: 1 } : undefined}
          className={cn(
            'relative overflow-hidden rounded-2xl border border-slate-300 bg-white px-4 py-2.5',
            isLaunch && 'border-indigo-200 bg-indigo-50/60 shadow-sm',
          )}
        >
          {isLaunch ? (
            <motion.div
              className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-transparent via-indigo-300/30 to-transparent"
              animate={{ x: ['-100%', '680%'] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : null}
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Workspace URL preview</div>
          <div className="mt-1 text-xs font-medium text-slate-800">{previewUrl}</div>
        </motion.div>
      ) : null}

      <CRMSelector
        value={crmType}
        onChange={onCrmTypeChange}
        error={errors.crmType}
        guideId={guideIds?.crmType}
        title="Choose your business type"
        subtitle="You can change this later"
        variant={variant}
      />
    </div>
  );
}
