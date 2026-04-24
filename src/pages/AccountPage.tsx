import { BriefcaseBusiness, Lock, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { crmOptions } from '../lib/constants';
import {
  getAccountSettings,
  updateAccountSettings,
  type AccountSettingsResponse,
} from '../lib/account-service';
import type { CRMType } from '../lib/types';
import { isValidWorkspaceSlug, slugify } from '../lib/utils';

type DateFormatOption = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd';
type LandingPageOption = '/dashboard' | '/records' | '/imports' | '/email' | '/account';

interface AccountPreferences {
  timezone: string;
  dateFormat: DateFormatOption;
  landingPage: LandingPageOption;
}

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
];

const INPUT_CLASSES =
  'h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900';
const READ_ONLY_INPUT_CLASSES =
  'h-11 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-600';

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function getDefaultPreferences(): AccountPreferences {
  return {
    timezone: getDefaultTimezone(),
    dateFormat: 'dd/mm/yyyy',
    landingPage: '/dashboard',
  };
}

function getPreferencesStorageKey(userId: string, workspaceId: string) {
  return `coreflow.account.preferences.${userId}.${workspaceId}`;
}

function formatRole(role: string | null | undefined) {
  if (!role) {
    return 'Member';
  }

  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatProvider(provider: string) {
  if (!provider) {
    return 'Email';
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function AccountPage() {
  const navigate = useNavigate();
  const { session, user, workspace, refreshWorkspace, signOut } = useAuth();
  const [settings, setSettings] = useState<AccountSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceCrmType, setWorkspaceCrmType] = useState<CRMType>('real-estate');
  const [preferences, setPreferences] = useState<AccountPreferences>(getDefaultPreferences);

  const authProviders = useMemo(() => {
    const rawProviders = user?.app_metadata?.providers;
    if (Array.isArray(rawProviders) && rawProviders.length > 0) {
      return rawProviders.map((provider) => formatProvider(String(provider)));
    }

    const singleProvider = user?.app_metadata?.provider;
    if (typeof singleProvider === 'string' && singleProvider.length > 0) {
      return [formatProvider(singleProvider)];
    }

    return ['Email'];
  }, [user?.app_metadata?.provider, user?.app_metadata?.providers]);

  usePageGuide({
    key: 'account-settings',
    title: 'Manage account and workspace settings',
    summary:
      'This page combines personal profile details, shared workspace identity, security visibility, and local preferences for the current CoreFlow workspace.',
    nextStep:
      settings?.workspace.can_manage
        ? 'Review profile changes first, then update shared workspace settings only when the whole team needs the new values.'
        : 'Use this page for your profile and personal preferences. Shared workspace settings stay read-only until permissions change.',
    highlights: ['Profile details', 'Workspace identity', 'Security and preferences'],
    autoStart: 'once',
    steps: [
      {
        id: 'account-refresh',
        title: 'Refresh the latest account data',
        body: 'Use refresh before editing if the workspace or profile might have changed in another session.',
        targetId: 'account-refresh',
      },
      {
        id: 'account-profile',
        title: 'Update the personal profile',
        body: 'This section controls how the user appears in workspace activity history and ownership labels.',
        targetId: 'account-profile-card',
      },
      {
        id: 'account-workspace',
        title: 'Review the shared workspace identity',
        body: 'Only change the shared workspace values when the whole team should see a new name, slug, or CRM type.',
        targetId: 'account-workspace-card',
      },
    ],
  });

  function applySettings(nextSettings: AccountSettingsResponse) {
    setSettings(nextSettings);
    setProfileName(nextSettings.profile.full_name ?? '');
    setWorkspaceName(nextSettings.workspace.name);
    setWorkspaceSlug(nextSettings.workspace.slug);
    setWorkspaceCrmType(nextSettings.workspace.crm_type);
  }

  async function loadSettings() {
    if (!session || !workspace) {
      return;
    }

    setLoading(true);

    try {
      const response = await getAccountSettings(session, workspace.id);
      applySettings(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load account settings.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session || !workspace) {
      return;
    }

    void loadSettings();
  }, [session, workspace]);

  useEffect(() => {
    if (!session || !workspace || typeof window === 'undefined') {
      return;
    }

    const defaults = getDefaultPreferences();
    const storageKey = getPreferencesStorageKey(session.user.id, workspace.id);
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      setPreferences(defaults);
      return;
    }

    try {
      const parsed = JSON.parse(storedValue) as Partial<AccountPreferences>;
      setPreferences({
        timezone:
          typeof parsed.timezone === 'string' && TIMEZONE_OPTIONS.includes(parsed.timezone)
            ? parsed.timezone
            : defaults.timezone,
        dateFormat:
          parsed.dateFormat === 'dd/mm/yyyy' ||
          parsed.dateFormat === 'mm/dd/yyyy' ||
          parsed.dateFormat === 'yyyy-mm-dd'
            ? parsed.dateFormat
            : defaults.dateFormat,
        landingPage:
          parsed.landingPage === '/dashboard' ||
          parsed.landingPage === '/records' ||
          parsed.landingPage === '/imports' ||
          parsed.landingPage === '/email' ||
          parsed.landingPage === '/account'
            ? parsed.landingPage
            : defaults.landingPage,
      });
    } catch {
      setPreferences(defaults);
    }
  }, [session, workspace]);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function handleSaveProfile() {
    if (!session || !workspace) {
      return;
    }

    const trimmed = profileName.trim();
    if (trimmed.length < 2) {
      toast.error('Full name must be at least 2 characters.');
      return;
    }

    setSavingProfile(true);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        profile: {
          full_name: trimmed,
        },
      });
      applySettings(response);
      toast.success('Profile updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile.';
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveWorkspace() {
    if (!session || !workspace) {
      return;
    }

    if (!settings?.workspace.can_manage) {
      toast.error('Only workspace owners or admins can update workspace settings.');
      return;
    }

    const trimmedName = workspaceName.trim();
    const trimmedSlug = workspaceSlug.trim();

    if (trimmedName.length < 2) {
      toast.error('Workspace name must be at least 2 characters.');
      return;
    }

    if (!isValidWorkspaceSlug(trimmedSlug)) {
      toast.error('Workspace slug must use 3+ lowercase letters, numbers, and hyphens only.');
      return;
    }

    setSavingWorkspace(true);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        workspace: {
          name: trimmedName,
          slug: trimmedSlug,
          crm_type: workspaceCrmType,
        },
      });
      applySettings(response);
      await refreshWorkspace(session);
      toast.success('Workspace setup updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update workspace setup.';
      toast.error(message);
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleSavePreferences() {
    if (!session || !workspace || typeof window === 'undefined') {
      return;
    }

    setSavingPreferences(true);

    try {
      const storageKey = getPreferencesStorageKey(session.user.id, workspace.id);
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
      toast.success('Preferences saved on this device.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save preferences.';
      toast.error(message);
    } finally {
      setSavingPreferences(false);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading account settings..." />;
  }

  if (loading && !settings) {
    return <FullPageLoader label="Loading account settings..." />;
  }

  const canManageWorkspace = Boolean(settings?.workspace.can_manage);

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Account"
          title="Account"
          description="Manage your profile, sign-in details, and personal preferences."
          actions={(
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadSettings()} data-guide-id="account-refresh">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        />

        <Card className="p-6" data-guide-id="account-profile-card">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Profile</h2>
              <p className="mt-1 text-sm text-slate-600">Update your personal details used across workspace activity logs.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Email</span>
                  <input value={settings?.profile.email ?? ''} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Full name</span>
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    className={INPUT_CLASSES}
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={() => void handleSaveProfile()} loading={savingProfile}>
                  Save profile
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6" data-guide-id="account-workspace-card">
          <div className="flex items-start gap-3">
            <BriefcaseBusiness className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Workspace setup</h2>
              <p className="mt-1 text-sm text-slate-600">Manage the shared workspace identity used across your CRM experience.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Workspace name</span>
                  <input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    className={INPUT_CLASSES}
                    disabled={!canManageWorkspace}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Workspace slug</span>
                  <input
                    value={workspaceSlug}
                    onChange={(event) => setWorkspaceSlug(slugify(event.target.value))}
                    className={INPUT_CLASSES}
                    disabled={!canManageWorkspace}
                  />
                  <span className="text-xs text-slate-500">Use lowercase letters, numbers, and hyphens.</span>
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Business type</span>
                  <select
                    value={workspaceCrmType}
                    onChange={(event) => setWorkspaceCrmType(event.target.value as CRMType)}
                    className={INPUT_CLASSES}
                    disabled={!canManageWorkspace}
                  >
                    {crmOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Your workspace role</span>
                  <input value={formatRole(settings?.workspace.role)} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {canManageWorkspace
                  ? 'Workspace owners and admins can update the shared workspace name, slug, and business type here.'
                  : 'Only workspace owners and admins can edit workspace setup.'}
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleSaveWorkspace()}
                  loading={savingWorkspace}
                  disabled={!canManageWorkspace}
                >
                  Save workspace
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Security</h2>
              <p className="mt-1 text-sm text-slate-600">Review how this account is signed in and which session is currently active.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Sign-in method</span>
                  <input value={authProviders.join(', ')} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Workspace role</span>
                  <input value={formatRole(settings?.workspace.role)} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Email verification</span>
                  <input value={user?.email_confirmed_at ? 'Verified' : 'Pending verification'} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Last sign in</span>
                  <input value={formatDateTime(user?.last_sign_in_at ?? null)} disabled className={READ_ONLY_INPUT_CLASSES} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Session expires</span>
                  <input
                    value={formatDateTime(session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null)}
                    disabled
                    className={READ_ONLY_INPUT_CLASSES}
                  />
                </label>
                <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Password changes and advanced security flows can be added later through your Supabase auth settings.
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" variant="secondary" onClick={() => void handleSignOut()}>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Settings2 className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Preferences</h2>
              <p className="mt-1 text-sm text-slate-600">Save personal viewing defaults for this browser and workspace.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Timezone</span>
                  <select
                    value={preferences.timezone}
                    onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))}
                    className={INPUT_CLASSES}
                  >
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Date format</span>
                  <select
                    value={preferences.dateFormat}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        dateFormat: event.target.value as DateFormatOption,
                      }))
                    }
                    className={INPUT_CLASSES}
                  >
                    <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                    <option value="mm/dd/yyyy">MM/DD/YYYY</option>
                    <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Default landing page</span>
                  <select
                    value={preferences.landingPage}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        landingPage: event.target.value as LandingPageOption,
                      }))
                    }
                    className={INPUT_CLASSES}
                  >
                    <option value="/dashboard">Overview</option>
                    <option value="/records">Records</option>
                    <option value="/imports">Imports</option>
                    <option value="/email">Email</option>
                    <option value="/account">Account</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                These preferences are currently saved per user and workspace in this browser.
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={() => void handleSavePreferences()} loading={savingPreferences}>
                  Save preferences
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </WorkspaceLayout>
  );
}
