import type { Session } from '@supabase/supabase-js';
import { MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  type VoiceNumberFilterAreaCodeOption,
  getVoiceNumberFilterOptions,
  type VoiceNumberFilterCityOption,
  type VoiceNumberFilterCountryOption,
  type VoiceNumberFilterStateOption,
  type VoiceNumberSearchFilters,
  type VoiceNumberSearchResult,
} from '../../lib/voice-service';

interface VoiceNumberSearchCardProps {
  session: Session;
  workspaceId: string;
  filters: Omit<VoiceNumberSearchFilters, 'workspace_id'>;
  loading: boolean;
  results: VoiceNumberSearchResult[];
  hasSearched: boolean;
  onFilterChange: (patch: Partial<Omit<VoiceNumberSearchFilters, 'workspace_id'>>) => void;
  onSearch: () => Promise<void>;
  onPurchaseClick: (result: VoiceNumberSearchResult) => void;
}

function formatLocation(result: VoiceNumberSearchResult) {
  return [result.locality, result.administrativeArea, result.countryCode].filter(Boolean).join(', ') || 'Unknown';
}

const DEFAULT_COUNTRY_OPTIONS: VoiceNumberFilterCountryOption[] = [{ code: 'US', name: 'United States' }];
const SEARCH_RESULTS_PAGE_SIZE = 12;

export function VoiceNumberSearchCard({
  session,
  workspaceId,
  filters,
  loading,
  results,
  hasSearched,
  onFilterChange,
  onSearch,
  onPurchaseClick,
}: VoiceNumberSearchCardProps) {
  const [countryOptions, setCountryOptions] = useState<VoiceNumberFilterCountryOption[]>(DEFAULT_COUNTRY_OPTIONS);
  const [stateOptions, setStateOptions] = useState<VoiceNumberFilterStateOption[]>([]);
  const [cityOptions, setCityOptions] = useState<VoiceNumberFilterCityOption[]>([]);
  const [areaCodeOptions, setAreaCodeOptions] = useState<VoiceNumberFilterAreaCodeOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [detailResult, setDetailResult] = useState<VoiceNumberSearchResult | null>(null);
  const onFilterChangeRef = useRef(onFilterChange);
  const areaCodeListId = useId();

  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  const normalizedState = (filters.administrative_area ?? '').trim().toUpperCase();
  const normalizedLocality = (filters.locality ?? '').trim().toLowerCase();
  const normalizedAreaCode = (filters.npa ?? '').trim();

  useEffect(() => {
    let active = true;

    setFilterOptionsLoading(true);

    void getVoiceNumberFilterOptions(session, {
      workspace_id: workspaceId,
      country_code: filters.country_code || 'US',
      administrative_area: filters.administrative_area || undefined,
      locality: filters.locality || undefined,
    })
      .then((data) => {
        if (!active) {
          return;
        }

        setCountryOptions(data.countries.length > 0 ? data.countries : DEFAULT_COUNTRY_OPTIONS);
        setStateOptions(data.states);
        setCityOptions(data.cities);
        setAreaCodeOptions(data.area_codes);

        const availableCountries = data.countries.length > 0 ? data.countries : DEFAULT_COUNTRY_OPTIONS;
        const selectedCountryCode = (filters.country_code ?? 'US').trim().toUpperCase();
        const hasSelectedCountry = availableCountries.some((country) => country.code === selectedCountryCode);
        const hasSelectedState = !normalizedState || data.states.some((state) => state.code === normalizedState);
        const hasSelectedCity =
          !normalizedLocality ||
          data.cities.some((city) => {
            const stateMatches = normalizedState ? city.stateCode === normalizedState : true;
            return stateMatches && city.city.toLowerCase() === normalizedLocality;
          });
        const hasSelectedAreaCode =
          !normalizedAreaCode ||
          data.area_codes.some((areaCode) => areaCode.code === normalizedAreaCode);

        const patch: Partial<Omit<VoiceNumberSearchFilters, 'workspace_id'>> = {};
        const nextCountryCode = hasSelectedCountry ? selectedCountryCode : availableCountries[0]?.code ?? 'US';

        if (nextCountryCode !== selectedCountryCode) {
          patch.country_code = nextCountryCode;
          patch.administrative_area = '';
          patch.locality = '';
          patch.npa = '';
        }

        if (!hasSelectedState && normalizedState) {
          patch.administrative_area = '';
        }

        if (!hasSelectedCity && normalizedLocality) {
          patch.locality = '';
        }

        if (!hasSelectedAreaCode && (filters.npa ?? '').trim()) {
          patch.npa = '';
        }

        if (Object.keys(patch).length > 0) {
          onFilterChangeRef.current(patch);
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setStateOptions([]);
        setCityOptions([]);
        setAreaCodeOptions([]);
      })
      .finally(() => {
        if (active) {
          setFilterOptionsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filters.country_code, normalizedAreaCode, session, workspaceId, normalizedLocality, normalizedState]);

  const filteredCityOptions = useMemo(() => {
    if (!normalizedState) {
      return cityOptions;
    }

    return cityOptions.filter((city) => city.stateCode === normalizedState);
  }, [cityOptions, normalizedState]);

  const selectedCityValue = useMemo(() => {
    if (!normalizedLocality) {
      return '';
    }

    const selected = filteredCityOptions.find((city) => city.city.toLowerCase() === normalizedLocality);
    return selected ? `${selected.city}::${selected.stateCode}` : '';
  }, [filteredCityOptions, normalizedLocality]);

  const filteredAreaCodeOptions = useMemo(() => {
    const cityScoped = areaCodeOptions.filter((areaCode) => {
      const stateMatches = normalizedState ? areaCode.stateCode === normalizedState : true;
      const cityMatches = normalizedLocality ? (areaCode.city ?? '').toLowerCase() === normalizedLocality : true;
      return stateMatches && cityMatches;
    });

    if (cityScoped.length > 0) {
      return cityScoped;
    }

    const stateScoped = areaCodeOptions.filter((areaCode) => (
      normalizedState ? areaCode.stateCode === normalizedState : true
    ));

    if (stateScoped.length > 0) {
      return stateScoped;
    }

    return areaCodeOptions;
  }, [areaCodeOptions, normalizedLocality, normalizedState]);

  useEffect(() => {
    setCurrentPage(1);
  }, [results, hasSearched]);

  useEffect(() => {
    setDetailResult(null);
    setIsFilterDrawerOpen(false);
  }, [results, hasSearched]);

  useEffect(() => {
    if (!detailResult && !isFilterDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (detailResult) {
        setDetailResult(null);
      } else {
        setIsFilterDrawerOpen(false);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [detailResult, isFilterDrawerOpen]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(results.length / SEARCH_RESULTS_PAGE_SIZE)), [results.length]);

  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * SEARCH_RESULTS_PAGE_SIZE;
    return results.slice(start, start + SEARCH_RESULTS_PAGE_SIZE);
  }, [currentPage, results]);
  const showEmptyResultsState = hasSearched && !loading && results.length === 0;

  function renderFilterFields() {
    return (
      <>
        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Country</span>
          <select
            data-guide-id="voice-number-country"
            value={filters.country_code ?? 'US'}
            onChange={(event) =>
              onFilterChange({
                country_code: event.target.value,
                administrative_area: '',
                locality: '',
                npa: '',
              })
            }
            className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
          >
            {countryOptions.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">State / Region</span>
          <select
            data-guide-id="voice-number-state"
            value={filters.administrative_area ?? ''}
            onChange={(event) => {
              const nextState = event.target.value;
              const currentCity = (filters.locality ?? '').trim().toLowerCase();
              const cityStillValid =
                !currentCity ||
                filteredCityOptions.some((city) => city.stateCode === nextState && city.city.toLowerCase() === currentCity);

              onFilterChange({
                administrative_area: nextState,
                locality: cityStillValid ? filters.locality : '',
                npa: '',
              });
            }}
            disabled={filterOptionsLoading}
            className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 disabled:bg-slate-100"
          >
            <option value="">Any state</option>
            {stateOptions.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">City</span>
          <select
            data-guide-id="voice-number-city"
            value={selectedCityValue}
            onChange={(event) => {
              const value = event.target.value;

              if (!value) {
                onFilterChange({ locality: '' });
                return;
              }

              const [city, stateCode] = value.split('::');
              onFilterChange({
                locality: city,
                administrative_area: stateCode || filters.administrative_area,
                npa: '',
              });
            }}
            disabled={filterOptionsLoading}
            className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 disabled:bg-slate-100"
          >
            <option value="">Any city</option>
            {filteredCityOptions.map((city) => (
              <option key={`${city.city}-${city.stateCode}`} value={`${city.city}::${city.stateCode}`}>
                {city.city} ({city.stateCode})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Area code / NDC</span>
          <input
            data-guide-id="voice-number-area"
            value={filters.npa ?? ''}
            onChange={(event) => onFilterChange({ npa: event.target.value.replace(/\D/g, '').slice(0, 6) })}
            list={filteredAreaCodeOptions.length > 0 ? areaCodeListId : undefined}
            placeholder={filteredAreaCodeOptions.length > 0 ? 'Select or type area code' : 'Type area code or NDC'}
            autoComplete="off"
            inputMode="numeric"
            disabled={filterOptionsLoading}
            className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100"
          />
          {filteredAreaCodeOptions.length > 0 ? (
            <datalist id={areaCodeListId}>
              {filteredAreaCodeOptions.map((areaCode) => (
                <option
                  key={`${areaCode.code}-${areaCode.stateCode}-${areaCode.city ?? 'any'}`}
                  value={areaCode.code}
                  label={areaCode.city ? `${areaCode.code} - ${areaCode.city}` : areaCode.code}
                />
              ))}
            </datalist>
          ) : null}
          <span className="text-xs text-slate-500">
            {filteredAreaCodeOptions.length > 0
              ? 'Suggestions are based on available provider inventory for the selected region.'
              : 'No provider area-code list is available for this selection yet. You can still type the NDC manually.'}
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Number type</span>
          <select
            value={filters.phone_number_type ?? ''}
            onChange={(event) =>
              onFilterChange({
                phone_number_type: event.target.value as 'local' | 'toll_free' | '',
              })
            }
            className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
          >
            <option value="">Any</option>
            <option value="local">Local</option>
            <option value="toll_free">Toll-free</option>
          </select>
        </label>
      </>
    );
  }

  return (
    <Card className="voice-number-search-card border border-slate-200/80 p-6 shadow-[0_14px_40px_-22px_rgba(15,23,42,0.5)]">
      <div aria-hidden="true" className="voice-number-search-orb voice-number-search-orb-top" />
      <div aria-hidden="true" className="voice-number-search-orb voice-number-search-orb-bottom" />
      <div aria-hidden="true" className="voice-number-search-orb voice-number-search-orb-mid" />

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-700">
            Managed provisioning
          </div>
          <h3 className="mt-2 font-display text-2xl text-slate-900">Search available Numbers</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            Search CoreFlow-managed inventory and provision a workspace line without exposing raw Telnyx setup to the
            user.
          </p>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsFilterDrawerOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
          <Button type="button" className="flex-1" onClick={() => void onSearch()} loading={loading}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>

        <div className="hidden gap-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)] backdrop-blur md:grid md:grid-cols-2 md:items-start xl:grid-cols-6">
          {renderFilterFields()}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <Button
              type="button"
              onClick={() => void onSearch()}
              loading={loading}
              className="h-12 w-full px-6"
              data-guide-id="voice-number-search"
            >
              <Search className="h-4 w-4" />
              Search Numbers
            </Button>
          </div>
        </div>

        {hasSearched && !loading ? (
          results.length > 0 ? (
            <div className="space-y-5" data-guide-id="voice-number-results">
              <div className="space-y-3 md:hidden">
                {paginatedResults.map((result) => (
                  <div key={result.phoneNumber} className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailResult(result)}
                        className="text-left font-semibold text-slate-900 transition hover:text-accent-blue"
                      >
                        {result.phoneNumber}
                      </button>
                      <Button type="button" size="sm" onClick={() => onPurchaseClick(result)}>
                        Buy
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-accent-blue" />
                      {formatLocation(result)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-300 bg-white md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left text-sm text-slate-700">
                    <thead className="border-b border-slate-300 bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Number</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Location</th>
                        <th className="px-4 py-3 font-medium">Monthly</th>
                        <th className="px-4 py-3 font-medium">Upfront</th>
                        <th className="px-4 py-3 font-medium">Features</th>
                        <th className="px-4 py-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResults.map((result) => (
                        <tr key={result.phoneNumber} className="border-b border-slate-200 last:border-b-0">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setDetailResult(result)}
                              className="font-semibold text-slate-900 transition hover:text-accent-blue"
                            >
                              {result.phoneNumber}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{result.phoneNumberType ?? 'standard'}</span>
                              {result.quickship ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-medium text-accent-blue">
                                  <Star className="h-3 w-3" />
                                  Quickship
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-accent-blue" />
                              {formatLocation(result)}
                            </div>
                          </td>
                          <td className="px-4 py-3">{result.monthlyCost ?? 'Unknown'}</td>
                          <td className="px-4 py-3">{result.upfrontCost ?? 'Unknown'}</td>
                          <td className="max-w-[300px] px-4 py-3">
                            <div className="truncate">
                              {result.features.length > 0 ? result.features.join(', ') : 'Not listed'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button type="button" size="sm" onClick={() => onPurchaseClick(result)}>
                              Buy Number
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPages > 1 ? (
                <>
                  <div className="flex items-center justify-between gap-3 md:hidden">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <div className="text-sm text-slate-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>

                  <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>

                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm transition ${
                          currentPage === page
                            ? 'border-accent-blue bg-accent-blue text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : showEmptyResultsState ? (
            <div className="rounded-[28px] border border-slate-300 bg-white px-5 py-4 text-sm text-slate-600" data-guide-id="voice-number-results">
              No available numbers matched your search. Try another country, region, city, or number type.
            </div>
          ) : null
        ) : null}
      </div>

      {isFilterDrawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setIsFilterDrawerOpen(false)}
            className="absolute inset-0 bg-transparent"
          />

          <aside className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-slate-300 bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-300 px-4 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-accent-blue">Filters</div>
                <div className="mt-1 font-medium text-slate-900">Refine number search</div>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{renderFilterFields()}</div>

            <div className="flex gap-3 border-t border-slate-300 px-4 py-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsFilterDrawerOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                className="flex-1"
                loading={loading}
                onClick={() => {
                  void onSearch();
                  setIsFilterDrawerOpen(false);
                }}
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {detailResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close number details"
            onClick={() => setDetailResult(null)}
            className="absolute inset-0 bg-transparent"
          />

          <aside
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-300 bg-slate-50 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.22em] text-accent-blue">Number details</div>
                <h3 className="mt-2 truncate font-display text-2xl text-slate-900">{detailResult.phoneNumber}</h3>
                <p className="mt-1 text-sm text-slate-600">{formatLocation(detailResult)}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailResult(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-700 transition hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Type</div>
                  <div className="mt-1 text-sm text-slate-900">{detailResult.phoneNumberType ?? 'standard'}</div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Quickship</div>
                  <div className="mt-1 text-sm text-slate-900">{detailResult.quickship ? 'Yes' : 'No'}</div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Monthly cost</div>
                  <div className="mt-1 text-sm text-slate-900">{detailResult.monthlyCost ?? 'Unknown'}</div>
                </div>
                <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Upfront cost</div>
                  <div className="mt-1 text-sm text-slate-900">{detailResult.upfrontCost ?? 'Unknown'}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Features</div>
                <div className="mt-2 text-sm text-slate-900">
                  {detailResult.features.length > 0 ? detailResult.features.join(', ') : 'Not listed'}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-300 px-5 py-4 sm:px-6">
              <Button type="button" variant="ghost" onClick={() => setDetailResult(null)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onPurchaseClick(detailResult);
                  setDetailResult(null);
                }}
              >
                Buy Number
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </Card>
  );
}
