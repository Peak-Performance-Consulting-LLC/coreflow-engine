import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { listAvailablePhoneNumberFilterOptions } from '../_shared/telnyx-numbers.ts';

interface CountryOption {
  code: string;
  name: string;
}

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
];

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
    const hasRequestedCountry = COUNTRY_OPTIONS.some((country) => country.code === requestedCountryCode);
    const countryCode = hasRequestedCountry ? requestedCountryCode : 'US';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const options = await listAvailablePhoneNumberFilterOptions({
      countryCode,
      sampleSize: 250,
    });

    return jsonResponse({
      countries: COUNTRY_OPTIONS,
      states: options.states,
      cities: options.cities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
