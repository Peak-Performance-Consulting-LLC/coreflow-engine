import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { PageHeader } from '../components/dashboard/PageHeader';
import { VoiceNumberPurchaseDrawer } from '../components/voice/VoiceNumberPurchaseDrawer';
import { VoiceNumberSearchCard } from '../components/voice/VoiceNumberSearchCard';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import type { VoiceNumberSearchResult } from '../lib/voice-service';
import { purchaseVoiceNumber, searchVoiceNumbers } from '../lib/voice-service';

export function VoiceNewNumberPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut, user } = useAuth();
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VoiceNumberSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResult, setSelectedResult] = useState<VoiceNumberSearchResult | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [filters, setFilters] = useState({
    country_code: 'US',
    locality: '',
    administrative_area: '',
    npa: '',
    phone_number_type: '' as 'local' | 'toll_free' | '',
  });

  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'voice-new-number',
      title: 'Provision a managed voice number',
      summary:
        'This page searches provider inventory and lets the workspace owner provision a number without exposing raw Telnyx setup to the rest of the team.',
      nextStep:
        hasSearched && searchResults.length > 0
          ? 'Review the matching numbers and buy the one that fits the region and routing needs.'
          : 'Choose the country and region filters first, then search the available inventory.',
      highlights: ['Country-aware search', 'Managed provisioning', 'Workspace-safe setup'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'voice-number-country',
          title: 'Choose the country first',
          body: 'Country selection controls the available downstream state, city, and area-code options for the provider search.',
          targetId: 'voice-number-country',
        },
        {
          id: 'voice-number-region',
          title: 'Narrow the region filters',
          body: 'Use state, city, and area code together when you need a local number, or keep them broad if you only care about availability.',
          targetId: 'voice-number-state',
        },
        {
          id: 'voice-number-search',
          title: 'Search the inventory',
          body: 'This action queries the managed provider inventory and returns the current numbers that can be purchased for the workspace.',
          targetId: 'voice-number-search',
        },
        {
          id: 'voice-number-results',
          title: 'Review the available results',
          body: 'Use the results list to compare location, number type, pricing, and features before buying a number into the workspace.',
          targetId: 'voice-number-results',
          placement: 'top',
        },
      ],
    }),
    [hasSearched, searchResults.length],
  );

  usePageGuide(guide);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function handleSearch() {
    if (!session || !workspace) {
      return;
    }

    setSearching(true);
    setHasSearched(true);

    try {
      const response = await searchVoiceNumbers(session, {
        workspace_id: workspace.id,
        country_code: filters.country_code || undefined,
        locality: filters.locality || undefined,
        administrative_area: filters.administrative_area || undefined,
        npa: filters.npa || undefined,
        limit: 20,
        phone_number_type: filters.phone_number_type || undefined,
      });
      setSearchResults(response.results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to search voice numbers.';
      toast.error(message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleFilterChange(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setHasSearched(false);
    setSearchResults([]);
  }

  async function handlePurchase(label: string) {
    if (!session || !workspace || !selectedResult) {
      return;
    }

    setPurchasing(true);

    try {
      const response = await purchaseVoiceNumber(session, {
        workspace_id: workspace.id,
        phone_number: selectedResult.phoneNumber,
        country_code: selectedResult.countryCode ?? filters.country_code ?? undefined,
        label: label || undefined,
      });
      toast.success(response.webhookReady ? 'Voice number provisioned.' : 'Voice number saved as pending.');

      if (!response.webhookReady && response.number.last_provisioning_error) {
        toast.error(response.number.last_provisioning_error);
      }

      setSelectedResult(null);
      setSearchResults((current) => current.filter((item) => item.phoneNumber !== selectedResult.phoneNumber));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to provision voice number.';
      toast.error(message);
    } finally {
      setPurchasing(false);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading voice number search..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Voice workspace"
          title="New number"
          description="Search available voice numbers across countries and provision a new managed workspace line."
          actions={(
            <>
              <Link
                to="/voice/numbers"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Provisioned numbers
              </Link>
              <Link
                to="/voice/assistants/new"
                className="inline-flex items-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                New assistant
              </Link>
            </>
          )}
        />

        <VoiceNumberSearchCard
          session={session}
          workspaceId={workspace.id}
          filters={filters}
          loading={searching}
          results={searchResults}
          hasSearched={hasSearched}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onPurchaseClick={(result) => setSelectedResult(result)}
        />
      </div>

      <VoiceNumberPurchaseDrawer
        isOpen={Boolean(selectedResult)}
        result={selectedResult}
        submitting={purchasing}
        onClose={() => {
          if (!purchasing) {
            setSelectedResult(null);
          }
        }}
        onSubmit={handlePurchase}
      />
    </WorkspaceLayout>
  );
}
