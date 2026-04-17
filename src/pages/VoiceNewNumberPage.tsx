import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { PageHeader } from '../components/dashboard/PageHeader';
import { VoiceNumberPurchaseDrawer } from '../components/voice/VoiceNumberPurchaseDrawer';
import { VoiceNumberSearchCard } from '../components/voice/VoiceNumberSearchCard';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
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
    limit: 10,
    phone_number_type: '' as 'local' | 'toll_free' | '',
  });

  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);

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
        limit: filters.limit,
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

  async function handlePurchase(label: string) {
    if (!session || !workspace || !selectedResult) {
      return;
    }

    setPurchasing(true);

    try {
      const response = await purchaseVoiceNumber(session, {
        workspace_id: workspace.id,
        phone_number: selectedResult.phoneNumber,
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
          filters={filters}
          loading={searching}
          results={searchResults}
          hasSearched={hasSearched}
          onFilterChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
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
