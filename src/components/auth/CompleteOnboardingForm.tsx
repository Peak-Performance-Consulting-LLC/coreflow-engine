import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { completeSignup } from '../../lib/auth-helpers';
import { getDashboardPath, isValidWorkspaceSlug, slugify } from '../../lib/utils';
import type { CRMType } from '../../lib/types';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { WorkspaceSetupFields } from './WorkspaceSetupFields';

export function CompleteOnboardingForm() {
  const navigate = useNavigate();
  const { session, user, refreshWorkspace, workspace } = useAuth();
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [crmType, setCrmType] = useState<CRMType>('real-estate');
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<'fullName' | 'workspaceName' | 'workspaceSlug' | 'crmType', string>>
  >({});

  useEffect(() => {
    setFullName(
      (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        '',
    );
  }, [user]);

  useEffect(() => {
    if (workspace) {
      navigate(getDashboardPath(workspace), { replace: true });
    }
  }, [navigate, workspace]);

  function updateWorkspaceName(value: string) {
    setWorkspaceName(value);
    if (!slugTouched) {
      setWorkspaceSlug(slugify(value));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: typeof errors = {};
    if (fullName.trim().length < 2) nextErrors.fullName = 'Enter your name.';
    if (workspaceName.trim().length < 2) nextErrors.workspaceName = 'Workspace name is required.';
    if (!isValidWorkspaceSlug(workspaceSlug)) {
      nextErrors.workspaceSlug = 'Use 3+ lowercase characters, numbers, and hyphens only.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !session) {
      return;
    }

    setLoading(true);

    try {
      const nextWorkspace = await completeSignup(
        {
          full_name: fullName.trim(),
          workspace_name: workspaceName.trim(),
          workspace_slug: workspaceSlug.trim(),
          crm_type: crmType,
        },
        session,
      );

      await refreshWorkspace(session);
      toast.success('Onboarding complete. Your workspace is ready.');
      navigate(getDashboardPath(nextWorkspace), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to finish onboarding.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Input
        label="Your name"
        placeholder="Jordan Lee"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        error={errors.fullName}
      />

      <WorkspaceSetupFields
        workspaceName={workspaceName}
        workspaceSlug={workspaceSlug}
        crmType={crmType}
        errors={errors}
        onWorkspaceNameChange={updateWorkspaceName}
        onWorkspaceSlugChange={(value) => {
          setSlugTouched(true);
          setWorkspaceSlug(slugify(value));
        }}
        onCrmTypeChange={setCrmType}
      />

      <Button type="submit" className="w-full" loading={loading}>
        Finish onboarding
      </Button>
    </form>
  );
}
