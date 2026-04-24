import { AnimatePresence, motion } from 'framer-motion';
import {
  BriefcaseBusiness,
  Lock,
  RefreshCw,
  Settings2,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import type { CRMType, WorkspaceSummary } from '../lib/types';
import { cn, formatCrmLabel, getInitials, isValidWorkspaceSlug, slugify } from '../lib/utils';

type DateFormatOption = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd';
type LandingPageOption = '/dashboard' | '/records' | '/imports' | '/email' | '/account';
type AccountSectionKey = 'profile' | 'workspace' | 'security' | 'preferences';

interface AccountPreferences {
  timezone: string;
  dateFormat: DateFormatOption;
  landingPage: LandingPageOption;
}

interface SettingsSection {
  key: AccountSectionKey;
  label: string;
  description: string;
  icon: typeof UserRound;
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

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'profile',
    label: 'Profile',
    description: 'Personal details and ownership labels.',
    icon: UserRound,
  },
  {
    key: 'workspace',
    label: 'Workspace',
    description: 'Shared identity and CRM mode.',
    icon: BriefcaseBusiness,
  },
  {
    key: 'security',
    label: 'Security',
    description: 'Sign-in, verification, and session.',
    icon: Lock,
  },
  {
    key: 'preferences',
    label: 'Preferences',
    description: 'Browser defaults and workspace view.',
    icon: Settings2,
  },
];

const TIMEZONE_DEFAULT = 'UTC';
const PANEL_TRANSITION = { duration: 0.22, ease: 'easeOut' as const };

const INPUT_CLASSES =
  'h-11 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const READ_ONLY_INPUT_CLASSES =
  'h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-600';

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || TIMEZONE_DEFAULT;
  } catch {
    return TIMEZONE_DEFAULT;
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
  if (!role) return 'Member';

  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatProvider(provider: string) {
  if (!provider) return 'Email';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function resolveWorkspaceFormValues(
  nextSettings: AccountSettingsResponse,
  activeWorkspace: WorkspaceSummary | null,
) {
  const settingsWorkspace = nextSettings.workspace;
  const activeWorkspaceMatches = Boolean(activeWorkspace && activeWorkspace.id === settingsWorkspace.id);

  return {
    name: settingsWorkspace.name.trim() || activeWorkspace?.name || '',
    slug: settingsWorkspace.slug.trim() || activeWorkspace?.slug || '',
    crmType:
      activeWorkspaceMatches && activeWorkspace?.crmType && activeWorkspace.crmType !== settingsWorkspace.crm_type
        ? activeWorkspace.crmType
        : settingsWorkspace.crm_type,
  };
}

function getRoleTone(role: string | null | undefined) {
  switch (role) {
    case 'owner':
      return 'indigo' as const;
    case 'admin':
      return 'green' as const;
    default:
      return 'slate' as const;
  }
}

function getRoleDescription(role: string | null | undefined) {
  switch (role) {
    case 'owner':
      return 'Owners can manage workspace identity, shared settings, and access-sensitive controls.';
    case 'admin':
      return 'Admins can manage most shared workspace settings, but ownership stays with the workspace owner.';
    default:
      return 'Members can update their own profile and preferences, but shared workspace settings remain read-only.';
  }
}

function arePreferencesEqual(left: AccountPreferences, right: AccountPreferences) {
  return (
    left.timezone === right.timezone &&
    left.dateFormat === right.dateFormat &&
    left.landingPage === right.landingPage
  );
}

function getProfileDisplayName(fullName: string, email: string | null | undefined) {
  const trimmedName = fullName.trim();
  if (trimmedName) return trimmedName;
  if (!email) return 'Workspace user';
  return email.split('@')[0] || 'Workspace user';
}

function getProfileInitials(fullName: string, email: string | null | undefined) {
  return getInitials(getProfileDisplayName(fullName, email));
}

function StatusBadge({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'slate' | 'indigo' | 'green' | 'amber' | 'rose';
}) {
  const styles = {
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', styles[tone])}>
      {label}
    </span>
  );
}

function SettingsNav({
  activeSection,
  onSelect,
}: {
  activeSection: AccountSectionKey;
  onSelect: (section: AccountSectionKey) => void;
}) {
  return (
    <aside className="w-full border-b border-slate-200 bg-slate-50/80 p-4 lg:w-[280px] lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
      <div className="mb-4 hidden lg:block">
        <div className="text-xs uppercase tracking-[0.22em] text-accent-blue">Settings</div>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Account settings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Choose one area to manage.</p>
      </div>

      <div
        className="grid grid-cols-2 gap-2 lg:flex lg:flex-col"
        data-guide-id="account-settings-nav"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.key;

          return (
            <motion.button
              key={section.key}
              type="button"
              layout
              onClick={() => onSelect(section.key)}
              whileHover={{ y: -1 }}  
              transition={PANEL_TRANSITION}
              className={cn(
                'group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition',
                active
                  ? 'border-indigo-200 bg-white text-indigo-700 shadow-[0_14px_35px_rgba(79,70,229,0.12)]'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition',
                  active
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 bg-slate-50 text-slate-500',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <div className={cn('text-sm font-semibold', active ? 'text-slate-950' : 'text-slate-800')}>
                  {section.label}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{section.description}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </aside>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  guideId,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  guideId?: string;
}) {
  return (
    <Card
      className="rounded-3xl border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]"
      data-guide-id={guideId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="mt-5">{children}</div>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  helper,
  badge,
}: {
  label: string;
  value: string;
  helper?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 text-sm font-medium text-slate-950">{value}</div>
          {helper ? <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p> : null}
        </div>
        {badge}
      </div>
    </div>
  );
}

function PreferenceRow({
  label,
  helper,
  control,
}: {
  label: string;
  helper: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="font-medium text-slate-950">{label}</div>
        <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p>
      </div>
      <div className="w-full shrink-0 md:w-[260px]">{control}</div>
    </div>
  );
}

function UnsavedChangesBar({
  visible,
  message,
  onSave,
  onReset,
  loading,
}: {
  visible: boolean;
  message: string;
  onSave: () => void;
  onReset: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={PANEL_TRANSITION}
          className="sticky bottom-4 z-10 mt-5 rounded-3xl border border-indigo-200 bg-white/95 px-4 py-3 shadow-[0_18px_45px_rgba(79,70,229,0.14)] backdrop-blur"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium text-slate-950">Unsaved changes</div>
              <p className="text-sm text-slate-600">{message}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onReset} disabled={loading}>
                Reset
              </Button>
              <Button type="button" onClick={onSave} loading={loading}>
                Save changes
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function AccountPage() {
  const navigate = useNavigate();
  const { session, user, workspace, refreshWorkspace, signOut } = useAuth();

  const [settings, setSettings] = useState<AccountSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [activeSection, setActiveSection] = useState<AccountSectionKey>('profile');

  const [profileName, setProfileName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceCrmType, setWorkspaceCrmType] = useState<CRMType>('real-estate');
  const [preferences, setPreferences] = useState<AccountPreferences>(getDefaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<AccountPreferences>(getDefaultPreferences);

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
      'This page combines personal profile details, shared workspace identity, security visibility, and local preferences.',
    nextStep:
      settings?.workspace.can_manage
        ? 'Review profile changes first, then update shared workspace settings only when the whole team needs the new values.'
        : 'Use this page for your profile and personal preferences. Shared workspace settings stay read-only until permissions change.',
    highlights: ['Profile details', 'Workspace identity', 'Security and preferences'],
    autoStart: 'once',
    steps: [
      {
        id: 'account-refresh',
        title: 'Refresh account data',
        body: 'Use refresh before editing if the workspace or profile might have changed in another session.',
        targetId: 'account-refresh',
      },
      {
        id: 'account-sidebar',
        title: 'Switch settings areas',
        body: 'Use the settings sidebar to move between profile, workspace, security, and preferences.',
        targetId: 'account-settings-nav',
      },
    ],
  });

  function applySettings(nextSettings: AccountSettingsResponse, activeWorkspaceOverride = workspace) {
    const resolvedWorkspace = resolveWorkspaceFormValues(nextSettings, activeWorkspaceOverride);

    setSettings(nextSettings);
    setProfileName(nextSettings.profile.full_name ?? '');
    setWorkspaceName(resolvedWorkspace.name);
    setWorkspaceSlug(resolvedWorkspace.slug);
    setWorkspaceCrmType(resolvedWorkspace.crmType);
  }

  async function loadSettings() {
    if (!session || !workspace) return;

    setLoading(true);

    try {
      const response = await getAccountSettings(session, workspace.id);
      applySettings(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load account settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session || !workspace) return;
    void loadSettings();
  }, [session, workspace]);

  useEffect(() => {
    if (!session || !workspace || typeof window === 'undefined') return;

    const defaults = getDefaultPreferences();
    const storageKey = getPreferencesStorageKey(session.user.id, workspace.id);
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      setPreferences(defaults);
      setSavedPreferences(defaults);
      return;
    }

    try {
      const parsed = JSON.parse(storedValue) as Partial<AccountPreferences>;
      const nextPreferences = {
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
      };

      setPreferences(nextPreferences);
      setSavedPreferences(nextPreferences);
    } catch {
      setPreferences(defaults);
      setSavedPreferences(defaults);
    }
  }, [session, workspace]);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function handleSaveProfile() {
    if (!session || !workspace) return;

    const trimmed = profileName.trim();
    if (trimmed.length < 2) {
      toast.error('Full name must be at least 2 characters.');
      return;
    }

    setSavingProfile(true);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        profile: { full_name: trimmed },
      });

      applySettings(response);
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveWorkspace() {
    if (!session || !workspace) return;

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

      const refreshedWorkspace = await refreshWorkspace(session);
      applySettings(response, refreshedWorkspace);
      toast.success('Workspace setup updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update workspace setup.');
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleSavePreferences() {
    if (!session || !workspace || typeof window === 'undefined') return;

    setSavingPreferences(true);

    try {
      const storageKey = getPreferencesStorageKey(session.user.id, workspace.id);
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
      setSavedPreferences(preferences);
      toast.success('Preferences saved on this device.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save preferences.');
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
  const workspaceDefaults = settings ? resolveWorkspaceFormValues(settings, workspace) : null;

  const profileDirty = profileName.trim() !== (settings?.profile.full_name ?? '').trim();
  const workspaceDirty = Boolean(
    workspaceDefaults &&
      (workspaceName.trim() !== workspaceDefaults.name.trim() ||
        workspaceSlug.trim() !== workspaceDefaults.slug.trim() ||
        workspaceCrmType !== workspaceDefaults.crmType),
  );
  const preferencesDirty = !arePreferencesEqual(preferences, savedPreferences);

  const profileRole = formatRole(settings?.workspace.role);
  const displayName = getProfileDisplayName(profileName, settings?.profile.email);
  const businessTypeLabel =
    crmOptions.find((option) => option.value === workspaceCrmType)?.label ?? formatCrmLabel(workspaceCrmType);
  const sessionExpiresDisplay = formatDateTime(
    session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  );

  const activeSectionConfig =
    SETTINGS_SECTIONS.find((section) => section.key === activeSection) ?? SETTINGS_SECTIONS[0];

  const activeMeta = {
    profile: {
      dirty: profileDirty,
      loading: savingProfile,
      message: 'Save your updated profile details.',
      onSave: () => void handleSaveProfile(),
      onReset: () => setProfileName(settings?.profile.full_name ?? ''),
    },
    workspace: {
      dirty: workspaceDirty,
      loading: savingWorkspace,
      message: 'Save the shared workspace identity.',
      onSave: () => void handleSaveWorkspace(),
      onReset: () => {
        if (!workspaceDefaults) return;
        setWorkspaceName(workspaceDefaults.name);
        setWorkspaceSlug(workspaceDefaults.slug);
        setWorkspaceCrmType(workspaceDefaults.crmType);
      },
    },
    security: {
      dirty: false,
      loading: false,
      message: '',
      onSave: () => undefined,
      onReset: () => undefined,
    },
    preferences: {
      dirty: preferencesDirty,
      loading: savingPreferences,
      message: 'Save your browser defaults for this workspace.',
      onSave: () => void handleSavePreferences(),
      onReset: () => setPreferences(savedPreferences),
    },
  }[activeSection];

  function renderProfileSection() {
    return (
      <div className="space-y-5" data-guide-id="account-profile-card">
        <SectionCard
          title="Profile summary"
          description="Your identity across records, activity logs, and ownership labels."
          action={<StatusBadge label={profileRole} tone={getRoleTone(settings?.workspace.role)} />}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-indigo-500 to-blue-500 text-2xl font-semibold text-white shadow-[0_18px_45px_rgba(79,70,229,0.24)]">
              {getProfileInitials(profileName, settings?.profile.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-semibold tracking-tight text-slate-950">{displayName}</div>
              <div className="mt-1 text-sm text-slate-500">{settings?.profile.email ?? 'No email on file'}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge label={profileRole} tone={getRoleTone(settings?.workspace.role)} />
                <StatusBadge label={authProviders.join(', ')} />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Profile details"
          description="Update personal details used inside this workspace."
          action={
            <Button type="button" onClick={() => void handleSaveProfile()} loading={savingProfile} disabled={!profileDirty}>
              Save profile
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
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
                placeholder="Your full name"
              />
            </label>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderWorkspaceSection() {
    return (
      <div className="space-y-5" data-guide-id="account-workspace-card">
        <SectionCard
          title="Workspace identity"
          description="Shared identity used across CRM, voice, and workspace flows."
          action={
            <Button
              type="button"
              onClick={() => void handleSaveWorkspace()}
              loading={savingWorkspace}
              disabled={!canManageWorkspace || !workspaceDirty}
            >
              Save workspace
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
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
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-slate-700 md:col-span-2">
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
          </div>

          {!canManageWorkspace ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This workspace is read-only for your role.
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Role and access"
          description="Understand what your current workspace role can change."
          action={<StatusBadge label={profileRole} tone={getRoleTone(settings?.workspace.role)} />}
        >
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current role</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge label={profileRole} tone={getRoleTone(settings?.workspace.role)} />
              <StatusBadge label={businessTypeLabel} tone="indigo" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{getRoleDescription(settings?.workspace.role)}</p>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderSecuritySection() {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <StatusRow
            label="Sign-in method"
            value={authProviders.join(', ')}
            helper="Provider linked to your current session."
            badge={<StatusBadge label="Active" tone="indigo" />}
          />
          <StatusRow
            label="Email verification"
            value={user?.email_confirmed_at ? 'Verified' : 'Pending verification'}
            helper="Verification status for workspace access."
            badge={
              <StatusBadge
                label={user?.email_confirmed_at ? 'Verified' : 'Pending'}
                tone={user?.email_confirmed_at ? 'green' : 'amber'}
              />
            }
          />
          <StatusRow
            label="Workspace role"
            value={profileRole}
            helper="Controls shared workspace setting access."
            badge={<StatusBadge label={profileRole} tone={getRoleTone(settings?.workspace.role)} />}
          />
          <StatusRow
            label="Last sign in"
            value={formatDateTime(user?.last_sign_in_at ?? null)}
            helper="Most recent login timestamp."
            badge={<StatusBadge label="Recent" tone="indigo" />}
          />
          <StatusRow
            label="Session expires"
            value={sessionExpiresDisplay}
            helper="Current browser session expiry."
            badge={<StatusBadge label="Active session" tone="indigo" />}
          />
        </div>

        <SectionCard
          title="Session actions"
          description="Sign out when you are done or need to switch accounts."
          action={
            <Button type="button" variant="secondary" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          }
        >
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            Signing out ends the current browser session for this account.
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderPreferencesSection() {
    return (
      <SectionCard
        title="Personal preferences"
        description="Stored for this user and workspace in the current browser."
        action={
          <Button
            type="button"
            onClick={() => void handleSavePreferences()}
            loading={savingPreferences}
            disabled={!preferencesDirty}
          >
            Save preferences
          </Button>
        }
      >
        <div className="space-y-4">
          <PreferenceRow
            label="Timezone"
            helper="Used for local date and time display."
            control={
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
            }
          />

          <PreferenceRow
            label="Date format"
            helper="Used in lists, cards, and details."
            control={
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
            }
          />

          <PreferenceRow
            label="Default landing page"
            helper="Choose your home base when returning to CoreFlow."
            control={
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
            }
          />
        </div>
      </SectionCard>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection();
      case 'workspace':
        return renderWorkspaceSection();
      case 'security':
        return renderSecuritySection();
      case 'preferences':
        return renderPreferencesSection();
      default:
        return null;
    }
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="space-y-5"
      >
        <div className="rounded-[32px] border border-white/60 bg-white/60 p-1 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <PageHeader
            eyebrow="Account"
            title="Account"
            description="Manage your profile, workspace, security, and preferences."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadSettings()}
                data-guide-id="account-refresh"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            }
          />
        </div>

        <Card className=" overflow-hidden rounded-[34px] border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
            <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />

            <main className="min-w-0 flex-1 bg-white">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-accent-blue">
                      {activeSectionConfig.label}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {activeSectionConfig.label}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                      {activeSectionConfig.description}
                    </p>
                  </div>

                  {activeSection === 'workspace' ? (
                    <StatusBadge
                      label={canManageWorkspace ? 'Can manage workspace' : 'Read only'}
                      tone={canManageWorkspace ? 'indigo' : 'amber'}
                    />
                  ) : null}
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {renderActiveSection()}
                  </motion.div>
                </AnimatePresence>

                <UnsavedChangesBar
                  visible={activeMeta.dirty}
                  message={activeMeta.message}
                  onSave={activeMeta.onSave}
                  onReset={activeMeta.onReset}
                  loading={activeMeta.loading}
                />
              </div>
            </main>
          </div>
        </Card>
      </motion.div>
    </WorkspaceLayout>
  );
}