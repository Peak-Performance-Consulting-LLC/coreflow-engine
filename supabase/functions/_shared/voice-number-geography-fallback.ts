import { City, State } from 'npm:country-state-city@3.2.1';

function normalizeLabel(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStateCode(value: string) {
  return normalizeLabel(value).toUpperCase();
}

function normalizeCityName(value: string) {
  return normalizeLabel(value);
}

export interface VoiceNumberFallbackStateOption {
  code: string;
  name: string;
}

export interface VoiceNumberFallbackCityOption {
  city: string;
  stateCode: string;
  stateName: string;
}

function getCountryStates(countryCode: string) {
  try {
    return State.getStatesOfCountry(countryCode);
  } catch {
    return [];
  }
}

export function listFallbackStateOptions(countryCode: string): VoiceNumberFallbackStateOption[] {
  const seen = new Set<string>();

  return getCountryStates(countryCode)
    .map((state) => {
      const name = normalizeLabel(state.name);
      const code = normalizeStateCode(state.name);

      if (!name || !code || seen.has(code)) {
        return null;
      }

      seen.add(code);

      return {
        code,
        name,
      } satisfies VoiceNumberFallbackStateOption;
    })
    .filter((state): state is VoiceNumberFallbackStateOption => Boolean(state))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listFallbackCityOptions(
  countryCode: string,
  selectedStateCode?: string | null,
): VoiceNumberFallbackCityOption[] {
  const normalizedSelectedState = normalizeStateCode(selectedStateCode ?? '');

  if (!normalizedSelectedState) {
    return [];
  }

  const states = getCountryStates(countryCode);
  const matchedState = states.find((state) => normalizeStateCode(state.name) === normalizedSelectedState);

  if (!matchedState?.isoCode) {
    return [];
  }

  const stateName = normalizeLabel(matchedState.name);
  const stateCode = normalizeStateCode(matchedState.name);
  const seen = new Set<string>();

  try {
    return City.getCitiesOfState(countryCode, matchedState.isoCode)
      .map((city) => {
        const cityName = normalizeCityName(city.name);

        if (!cityName) {
          return null;
        }

        const dedupeKey = cityName.toLowerCase();

        if (seen.has(dedupeKey)) {
          return null;
        }

        seen.add(dedupeKey);

        return {
          city: cityName,
          stateCode,
          stateName,
        } satisfies VoiceNumberFallbackCityOption;
      })
      .filter((city): city is VoiceNumberFallbackCityOption => Boolean(city))
      .sort((left, right) => left.city.localeCompare(right.city));
  } catch {
    return [];
  }
}
