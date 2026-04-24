import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  listFallbackCityOptions,
  listFallbackStateOptions,
} from '../_shared/voice-number-geography-fallback.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { isAllowedVoiceNumberCountryCode, resolveVoiceNumberCountryName } from '../_shared/voice-number-country-options.ts';
import {
  listAvailablePhoneNumberFilterOptions,
  listAvailableVoiceCountryOptions,
} from '../_shared/telnyx-numbers.ts';

interface StateLikeOption {
  code: string;
  name: string;
}

interface CityLikeOption {
  city: string;
  stateCode: string;
  stateName: string;
}

interface AreaCodeLikeOption {
  code: string;
  stateCode: string;
  stateName: string;
  city: string | null;
}

function mergeStateOptions(...groups: StateLikeOption[][]) {
  const merged = new Map<string, StateLikeOption>();

  for (const group of groups) {
    for (const state of group) {
      const code = state.code.trim().toUpperCase();

      if (!code || merged.has(code)) {
        continue;
      }

      merged.set(code, {
        code,
        name: state.name.trim() || code,
      });
    }
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function mergeCityOptions(...groups: CityLikeOption[][]) {
  const merged = new Map<string, CityLikeOption>();

  for (const group of groups) {
    for (const city of group) {
      const stateCode = city.stateCode.trim().toUpperCase();
      const cityName = city.city.trim();

      if (!stateCode || !cityName) {
        continue;
      }

      const key = `${cityName.toLowerCase()}::${stateCode}`;

      if (merged.has(key)) {
        continue;
      }

      merged.set(key, {
        city: cityName,
        stateCode,
        stateName: city.stateName.trim() || stateCode,
      });
    }
  }

  return [...merged.values()].sort((left, right) => {
    const stateCompare = left.stateCode.localeCompare(right.stateCode);
    return stateCompare !== 0 ? stateCompare : left.city.localeCompare(right.city);
  });
}

function mergeAreaCodeOptions(...groups: AreaCodeLikeOption[][]) {
  const merged = new Map<string, AreaCodeLikeOption>();

  for (const group of groups) {
    for (const areaCode of group) {
      const code = areaCode.code.trim();
      const stateCode = areaCode.stateCode.trim().toUpperCase();
      const city = areaCode.city?.trim() || null;

      if (!code) {
        continue;
      }

      const key = `${code}::${stateCode}::${(city ?? '').toLowerCase()}`;

      if (merged.has(key)) {
        continue;
      }

      merged.set(key, {
        code,
        stateCode,
        stateName: areaCode.stateName.trim() || stateCode || 'N/A',
        city,
      });
    }
  }

  return [...merged.values()].sort((left, right) => {
    const stateCompare = left.stateCode.localeCompare(right.stateCode);
    if (stateCompare !== 0) {
      return stateCompare;
    }

    const cityCompare = (left.city ?? '').localeCompare(right.city ?? '');
    return cityCompare !== 0 ? cityCompare : left.code.localeCompare(right.code);
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    const requestedCountryCode = typeof payload.country_code === 'string' ? payload.country_code.trim().toUpperCase() : 'US';
    const administrativeArea = typeof payload.administrative_area === 'string' ? payload.administrative_area.trim() : '';
    const locality = typeof payload.locality === 'string' ? payload.locality.trim() : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    let countries = [] as Array<{ code: string; name: string }>;

    try {
      countries = await listAvailableVoiceCountryOptions();
    } catch (error) {
      console.warn('[voice-number-filter-options] Telnyx country coverage fetch failed; falling back to requested country only.', {
        requestedCountryCode,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const fallbackCountryCode = isAllowedVoiceNumberCountryCode(requestedCountryCode) ? requestedCountryCode : 'US';
    const fallbackCountry = {
      code: fallbackCountryCode,
      name: resolveVoiceNumberCountryName(fallbackCountryCode),
    };
    const availableCountryCodes = new Set(countries.map((country) => country.code));
    const selectedCountry = countries.find((country) => country.code === requestedCountryCode)
      ?? countries[0]
      ?? fallbackCountry;
    const countryCode = selectedCountry.code;

    if (!availableCountryCodes.has(fallbackCountry.code) && countries.length === 0) {
      countries = [fallbackCountry];
    }

    let countryLevelOptions = {
      states: [] as StateLikeOption[],
      cities: [] as CityLikeOption[],
      areaCodes: [] as AreaCodeLikeOption[],
    };

    try {
      countryLevelOptions = await listAvailablePhoneNumberFilterOptions({
        countryCode,
        sampleSize: 250,
      });
    } catch (error) {
      console.warn('[voice-number-filter-options] Telnyx filter option fetch failed; using geography fallback only.', {
        countryCode,
        administrativeArea,
        locality,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const fallbackStates = listFallbackStateOptions(countryCode);
    const fallbackCities = listFallbackCityOptions(countryCode, administrativeArea || null);
    return jsonResponse({
      countries,
      states: mergeStateOptions(fallbackStates, countryLevelOptions.states),
      cities: mergeCityOptions(fallbackCities, countryLevelOptions.cities),
      area_codes: mergeAreaCodeOptions(countryLevelOptions.areaCodes),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
