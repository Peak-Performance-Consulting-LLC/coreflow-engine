import AreaCodes from 'areacodes';

export interface StateSuggestion {
  code: string;
  name: string;
}

export interface CitySuggestion {
  city: string;
  stateCode: string;
  stateName: string;
}

export interface AreaCodeSuggestion {
  areaCode: string;
  city: string;
  stateCode: string;
  stateName: string;
}

export interface VoiceSearchSuggestions {
  states: StateSuggestion[];
  cities: CitySuggestion[];
  areaCodes: AreaCodeSuggestion[];
}

type AreaCodeRecord = {
  city?: string;
  state?: string;
  stateCode?: string;
};

let suggestionsPromise: Promise<VoiceSearchSuggestions> | null = null;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function loadAreaCodeRecords() {
  const areaCodes = new AreaCodes();

  return new Promise<Record<string, AreaCodeRecord>>((resolve, reject) => {
    areaCodes.getAll((error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data ?? {});
    });
  });
}

async function buildVoiceSearchSuggestions(): Promise<VoiceSearchSuggestions> {
  const rawRecords = await loadAreaCodeRecords();
  const stateMap = new Map<string, StateSuggestion>();
  const cityMap = new Map<string, CitySuggestion>();
  const areaCodeMap = new Map<string, AreaCodeSuggestion>();

  for (const [areaCode, record] of Object.entries(rawRecords)) {
    const stateCode = record.stateCode?.trim().toUpperCase() ?? '';
    const stateName = record.state?.trim() ?? '';
    const city = record.city?.trim() ?? '';

    if (stateCode && stateName && !stateMap.has(stateCode)) {
      stateMap.set(stateCode, {
        code: stateCode,
        name: stateName,
      });
    }

    if (city && stateCode && stateName) {
      const cityKey = `${normalizeText(city)}:${stateCode}`;

      if (!cityMap.has(cityKey)) {
        cityMap.set(cityKey, {
          city,
          stateCode,
          stateName,
        });
      }

      if (!areaCodeMap.has(areaCode)) {
        areaCodeMap.set(areaCode, {
          areaCode,
          city,
          stateCode,
          stateName,
        });
      }
    }
  }

  return {
    states: [...stateMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    cities: [...cityMap.values()].sort((left, right) => {
      const stateCompare = left.stateCode.localeCompare(right.stateCode);
      return stateCompare !== 0 ? stateCompare : left.city.localeCompare(right.city);
    }),
    areaCodes: [...areaCodeMap.values()].sort((left, right) => left.areaCode.localeCompare(right.areaCode)),
  };
}

export function getVoiceSearchSuggestions() {
  if (!suggestionsPromise) {
    suggestionsPromise = buildVoiceSearchSuggestions();
  }

  return suggestionsPromise;
}
