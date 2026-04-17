declare module 'areacodes' {
  interface AreaCodeRecord {
    type: string;
    city?: string;
    state?: string;
    stateCode?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }

  class AreaCodes {
    get(
      phoneNumber: string,
      done: (error: Error | null, data: AreaCodeRecord | null) => void,
    ): void;
    getAll(
      done: (error: Error | null, data: Record<string, AreaCodeRecord>) => void,
    ): void;
  }

  export default AreaCodes;
}
