import { Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import {
  getAccountSettings,
  startEmailOAuth,
  updateAccountSettings,
  type AccountSettingsResponse,
  type WorkspaceEmailSender,
  type WorkspaceEmailSequenceStep,
} from '../lib/account-service';

interface EditableStep {
  step_order: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  is_active: boolean;
}

function mapSteps(steps: WorkspaceEmailSequenceStep[]): EditableStep[] {
  if (steps.length === 0) {
    return [
      {
        step_order: 1,
        delay_hours: 0,
        subject_template: 'Quick follow-up from {{workspace_name}}',
        body_template:
          'Hi {{lead_full_name}},\n\nThanks for your interest. We wanted to quickly follow up and see how we can help.\n\nBest,\n{{sender_name}}',
        is_active: true,
      },
      {
        step_order: 2,
        delay_hours: 48,
        subject_template: 'Checking in on your request',
        body_template:
          'Hi {{lead_full_name}},\n\nJust checking in regarding your request. If you are available, reply here and we can continue.\n\nBest,\n{{sender_name}}',
        is_active: true,
      },
      {
        step_order: 3,
        delay_hours: 120,
        subject_template: 'Final follow-up',
        body_template:
          'Hi {{lead_full_name}},\n\nThis is a final follow-up from {{workspace_name}}. If timing is not right, no problem. We are here when you are ready.\n\nBest,\n{{sender_name}}',
        is_active: true,
      },
    ];
  }

  return [...steps]
    .sort((left, right) => left.step_order - right.step_order)
    .map((step) => ({
      step_order: step.step_order,
      delay_hours: step.delay_hours,
      subject_template: step.subject_template,
      body_template: step.body_template,
      is_active: step.is_active,
    }));
}

function formatSenderStatus(sender: WorkspaceEmailSender) {
  if (sender.status === 'connected') {
    return sender.health_status === 'healthy' ? 'Connected' : `Connected (${sender.health_status})`;
  }

  if (sender.status === 'pending') {
    return 'Pending OAuth';
  }

  return sender.status;
}

export function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, workspace, signOut } = useAuth();
  const [settings, setSettings] = useState<AccountSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'microsoft' | null>(null);
  const [senderActionLoadingId, setSenderActionLoadingId] = useState<string | null>(null);

  const [profileName, setProfileName] = useState('');
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationTimezone, setAutomationTimezone] = useState('UTC');
  const [steps, setSteps] = useState<EditableStep[]>([]);

  const [smtpSenderId, setSmtpSenderId] = useState<string | null>(null);
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpName, setSmtpName] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [smtpDefault, setSmtpDefault] = useState(false);

  const canManage = Boolean(settings?.workspace.can_manage);

  function applySettings(nextSettings: AccountSettingsResponse) {
    setSettings(nextSettings);
    setProfileName(nextSettings.profile.full_name ?? '');
    setAutomationEnabled(nextSettings.automation.is_enabled);
    setAutomationTimezone(nextSettings.automation.timezone || 'UTC');
    setSteps(mapSteps(nextSettings.sequence_steps));

    const smtp = nextSettings.senders.find((sender) => sender.provider === 'smtp') ?? null;
    setSmtpSenderId(smtp?.id ?? null);
    setSmtpEmail(smtp?.sender_email ?? '');
    setSmtpName(smtp?.sender_name ?? '');
    setSmtpHost(smtp?.smtp_host ?? '');
    setSmtpPort(smtp?.smtp_port ?? 587);
    setSmtpUsername(smtp?.smtp_username ?? '');
    setSmtpPassword('');
    setSmtpTls(smtp?.smtp_use_tls ?? true);
    setSmtpDefault(Boolean(smtp?.is_default));
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
    const params = new URLSearchParams(location.search);
    const oauthStatus = params.get('oauth_status');

    if (!oauthStatus) {
      return;
    }

    if (oauthStatus === 'success') {
      toast.success('Email provider connected successfully.');
    } else {
      const message = params.get('oauth_message') || 'Unable to connect email provider.';
      toast.error(message);
    }

    navigate('/account', { replace: true });
    void loadSettings();
  }, [location.search, navigate]);

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

  async function handleConnectOAuth(provider: 'google' | 'microsoft') {
    if (!session || !workspace) {
      return;
    }

    setOauthLoading(provider);

    try {
      const response = await startEmailOAuth(session, {
        workspace_id: workspace.id,
        provider,
        return_path: '/account',
      });

      window.location.href = response.authorize_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start OAuth flow.';
      toast.error(message);
      setOauthLoading(null);
    }
  }

  async function handleSaveSmtpSender() {
    if (!session || !workspace) {
      return;
    }

    if (!smtpEmail.trim() || !smtpHost.trim() || !smtpUsername.trim()) {
      toast.error('SMTP sender requires sender email, host, and username.');
      return;
    }

    if (!smtpSenderId && !smtpPassword.trim()) {
      toast.error('SMTP password is required when creating a sender.');
      return;
    }

    if (Number.isNaN(smtpPort) || smtpPort <= 0) {
      toast.error('SMTP port must be a valid positive number.');
      return;
    }

    setSavingSmtp(true);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        sender: {
          id: smtpSenderId ?? undefined,
          provider: 'smtp',
          sender_email: smtpEmail.trim().toLowerCase(),
          sender_name: smtpName.trim() || null,
          is_active: true,
          is_default: smtpDefault,
          smtp: {
            host: smtpHost.trim(),
            port: smtpPort,
            username: smtpUsername.trim(),
            password: smtpPassword.trim() || undefined,
            use_tls: smtpTls,
          },
        },
      });

      applySettings(response);
      toast.success('SMTP sender saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save SMTP sender.';
      toast.error(message);
    } finally {
      setSavingSmtp(false);
    }
  }

  async function handleUpdateSender(senderId: string, patch: { is_default?: boolean; is_active?: boolean }) {
    if (!session || !workspace) {
      return;
    }

    setSenderActionLoadingId(senderId);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        sender: {
          id: senderId,
          ...patch,
        },
      });
      applySettings(response);
      toast.success('Sender updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update sender.';
      toast.error(message);
    } finally {
      setSenderActionLoadingId(null);
    }
  }

  async function handleSaveAutomation() {
    if (!session || !workspace) {
      return;
    }

    const invalidStep = steps.find((step) => step.subject_template.trim().length === 0 || step.body_template.trim().length === 0);

    if (invalidStep) {
      toast.error(`Step ${invalidStep.step_order} requires subject and body templates.`);
      return;
    }

    setSavingAutomation(true);

    try {
      const response = await updateAccountSettings(session, {
        workspace_id: workspace.id,
        automation: {
          is_enabled: automationEnabled,
          timezone: automationTimezone || 'UTC',
        },
        sequence_steps: steps.map((step) => ({
          step_order: step.step_order,
          delay_hours: Math.max(0, Number(step.delay_hours) || 0),
          subject_template: step.subject_template,
          body_template: step.body_template,
          is_active: step.is_active,
        })),
      });

      applySettings(response);
      toast.success('Automation settings updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update automation settings.';
      toast.error(message);
    } finally {
      setSavingAutomation(false);
    }
  }

  function updateStep(stepOrder: number, patch: Partial<EditableStep>) {
    setSteps((current) => current.map((step) => (step.step_order === stepOrder ? { ...step, ...patch } : step)));
  }

  const oauthSenders = useMemo(
    () => (settings?.senders ?? []).filter((sender) => sender.provider === 'google' || sender.provider === 'microsoft'),
    [settings?.senders],
  );

  if (!session || !workspace) {
    return <FullPageLoader label="Loading account settings..." />;
  }

  if (loading && !settings) {
    return <FullPageLoader label="Loading account settings..." />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Account"
          title="Account and email automation"
          description="Configure profile, shared sender connections, and lead follow-up email automation for this workspace."
          actions={(
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadSettings()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        />

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Profile</h2>
              <p className="mt-1 text-sm text-slate-600">Update your account profile used across workspace activity logs.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Email</span>
                  <input
                    value={settings?.profile.email ?? ''}
                    disabled
                    className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-600"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                  <span className="font-medium">Full name</span>
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
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

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-accent-blue" />
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h2 className="font-semibold text-slate-900">Email sender connections</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use one shared professional mailbox for automated lead follow-ups in this workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleConnectOAuth('google')}
                  loading={oauthLoading === 'google'}
                  disabled={!canManage}
                >
                  Connect Google
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleConnectOAuth('microsoft')}
                  loading={oauthLoading === 'microsoft'}
                  disabled={!canManage}
                >
                  Connect Microsoft
                </Button>
              </div>

              {oauthSenders.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-300">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Provider</th>
                        <th className="px-3 py-2.5 font-medium">Sender</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oauthSenders.map((sender) => (
                        <tr key={sender.id} className="border-t border-slate-200">
                          <td className="px-3 py-2.5 capitalize">{sender.provider}</td>
                          <td className="px-3 py-2.5">{sender.sender_email}</td>
                          <td className="px-3 py-2.5">{formatSenderStatus(sender)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canManage || sender.is_default}
                                loading={senderActionLoadingId === sender.id}
                                onClick={() => void handleUpdateSender(sender.id, { is_default: true })}
                              >
                                Set default
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canManage}
                                loading={senderActionLoadingId === sender.id}
                                onClick={() => void handleUpdateSender(sender.id, { is_active: !sender.is_active })}
                              >
                                {sender.is_active ? 'Disable' : 'Enable'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No OAuth sender connected yet.
                </div>
              )}

              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                <h3 className="font-medium text-slate-900">SMTP fallback</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Configure SMTP for providers not covered by OAuth. Password is encrypted at rest.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">Sender email</span>
                    <input
                      value={smtpEmail}
                      onChange={(event) => setSmtpEmail(event.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">Sender name</span>
                    <input
                      value={smtpName}
                      onChange={(event) => setSmtpName(event.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">SMTP host</span>
                    <input
                      value={smtpHost}
                      onChange={(event) => setSmtpHost(event.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">SMTP port</span>
                    <input
                      type="number"
                      min={1}
                      value={smtpPort}
                      onChange={(event) => setSmtpPort(Number.parseInt(event.target.value, 10) || 0)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">SMTP username</span>
                    <input
                      value={smtpUsername}
                      onChange={(event) => setSmtpUsername(event.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">SMTP password {smtpSenderId ? '(optional to keep existing)' : ''}</span>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(event) => setSmtpPassword(event.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={smtpTls}
                      onChange={(event) => setSmtpTls(event.target.checked)}
                      disabled={!canManage}
                    />
                    Use TLS
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={smtpDefault}
                      onChange={(event) => setSmtpDefault(event.target.checked)}
                      disabled={!canManage}
                    />
                    Set as default sender
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={() => void handleSaveSmtpSender()} loading={savingSmtp} disabled={!canManage}>
                    Save SMTP sender
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-slate-900">Follow-up automation</h2>
              <p className="mt-1 text-sm text-slate-600">
                Automatically queue 3 follow-up emails after lead creation when the lead has an email address.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={automationEnabled}
                  onChange={(event) => setAutomationEnabled(event.target.checked)}
                  disabled={!canManage}
                />
                Enable automation
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                <span className="font-medium">Timezone</span>
                <input
                  value={automationTimezone}
                  onChange={(event) => setAutomationTimezone(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                  disabled={!canManage}
                  placeholder="UTC"
                />
              </label>
            </div>

            <div className="space-y-4">
              {steps.map((step) => (
                <div key={step.step_order} className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">Step {step.step_order}</div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={step.is_active}
                        onChange={(event) => updateStep(step.step_order, { is_active: event.target.checked })}
                        disabled={!canManage}
                      />
                      Active
                    </label>
                  </div>

                  <label className="mb-3 flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">Delay (hours)</span>
                    <input
                      type="number"
                      min={0}
                      value={step.delay_hours}
                      onChange={(event) =>
                        updateStep(step.step_order, {
                          delay_hours: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                        })
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="mb-3 flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">Subject template</span>
                    <input
                      value={step.subject_template}
                      onChange={(event) => updateStep(step.step_order, { subject_template: event.target.value })}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm text-slate-700">
                    <span className="font-medium">Body template</span>
                    <textarea
                      rows={5}
                      value={step.body_template}
                      onChange={(event) => updateStep(step.step_order, { body_template: event.target.value })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      disabled={!canManage}
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-500">
              Available template tokens: {(settings?.tokens ?? []).join(', ')}
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => void handleSaveAutomation()} loading={savingAutomation} disabled={!canManage}>
                Save automation
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </WorkspaceLayout>
  );
}
