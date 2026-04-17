import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';
import type {
  CrmWorkspaceConfig,
  ImportJobInput,
  RecordDetailResponse,
  RecordListPageResult,
  RecordListQuery,
  RecordNote,
  RecordSaveInput,
  RecordSummary,
  RecordTask,
} from './crm-types';

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const RECORDS_CACHE_TTL_MS = 30 * 1000;
const RECORD_DETAIL_CACHE_TTL_MS = 30 * 1000;

interface CacheEntry<T> {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
}

const configCache = new Map<string, CacheEntry<CrmWorkspaceConfig>>();
const recordsCache = new Map<string, CacheEntry<RecordListPageResult>>();
const recordDetailCache = new Map<string, CacheEntry<RecordDetailResponse>>();

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function invoke<TResponse>(name: string, session: Session, body?: unknown) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<TResponse>(name, {
    body: body as Record<string, unknown> | undefined,
    headers: getAuthHeaders(session),
  });

  if (error) {
    throw new Error(error.message || 'Request failed.');
  }

  return data as TResponse;
}

function isCacheFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number) {
  if (!entry?.data) {
    return false;
  }

  return Date.now() - entry.fetchedAt < ttlMs;
}

function createRecordsCacheKey(filters: RecordListQuery) {
  return [
    filters.workspace_id,
    filters.search,
    filters.stage_id ?? '',
    filters.source_id ?? '',
    filters.assignee_user_id ?? '',
    filters.status ?? '',
    filters.include_archived ? '1' : '0',
    String(filters.page),
    String(filters.pageSize),
  ].join('::');
}

function createRecordDetailCacheKey(workspaceId: string, recordId: string) {
  return `${workspaceId}::${recordId}`;
}

function updateListResponseItems(
  response: RecordListPageResult,
  updater: (records: RecordSummary[]) => RecordSummary[],
): RecordListPageResult {
  const nextItems = updater(response.items);

  return {
    ...response,
    items: nextItems,
    records: nextItems,
  };
}

function updateRecordAcrossListCaches(workspaceId: string, record: RecordSummary) {
  for (const [cacheKey, entry] of recordsCache.entries()) {
    if (!cacheKey.startsWith(`${workspaceId}::`) || !entry.data) {
      continue;
    }

    recordsCache.set(cacheKey, {
      ...entry,
      data: updateListResponseItems(entry.data, (current) =>
        current.map((item) => (item.id === record.id ? { ...item, ...record } : item)),
      ),
      fetchedAt: Date.now(),
    });
  }
}

function invalidateWorkspaceRecordLists(workspaceId: string) {
  for (const cacheKey of recordsCache.keys()) {
    if (cacheKey.startsWith(`${workspaceId}::`)) {
      recordsCache.delete(cacheKey);
    }
  }
}

function invalidateRecordDetail(workspaceId: string, recordId: string) {
  recordDetailCache.delete(createRecordDetailCacheKey(workspaceId, recordId));
}

export function getCachedCrmWorkspaceConfig(workspaceId: string) {
  return configCache.get(workspaceId)?.data ?? null;
}

export async function fetchCrmWorkspaceConfig(session: Session, workspaceId: string) {
  const cachedEntry = configCache.get(workspaceId);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, CONFIG_CACHE_TTL_MS)) {
    return cachedEntry!.data as CrmWorkspaceConfig;
  }

  const request = invoke<CrmWorkspaceConfig>('records-config', session, {
    workspace_id: workspaceId,
  })
    .then((config) => {
      configCache.set(workspaceId, {
        data: config,
        fetchedAt: Date.now(),
      });
      return config;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        configCache.set(workspaceId, cachedEntry);
      } else {
        configCache.delete(workspaceId);
      }
      throw error;
    });

  configCache.set(workspaceId, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export async function refreshCrmWorkspaceConfig(session: Session, workspaceId: string) {
  const cachedEntry = configCache.get(workspaceId);
  const request = invoke<CrmWorkspaceConfig>('records-config', session, {
    workspace_id: workspaceId,
  })
    .then((config) => {
      configCache.set(workspaceId, {
        data: config,
        fetchedAt: Date.now(),
      });
      return config;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        configCache.set(workspaceId, cachedEntry);
      } else {
        configCache.delete(workspaceId);
      }
      throw error;
    });

  configCache.set(workspaceId, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export function getCachedWorkspaceRecords(filters: RecordListQuery) {
  return recordsCache.get(createRecordsCacheKey(filters))?.data ?? null;
}

export async function listWorkspaceRecords(session: Session, filters: RecordListQuery) {
  const cacheKey = createRecordsCacheKey(filters);
  const cachedEntry = recordsCache.get(cacheKey);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, RECORDS_CACHE_TTL_MS)) {
    return cachedEntry!.data as RecordListPageResult;
  }

  const request = invoke<RecordListPageResult>('records-list', session, filters)
    .then((response) => {
      recordsCache.set(cacheKey, {
        data: {
          ...response,
          items: response.items ?? response.records ?? [],
          records: response.records ?? response.items ?? [],
        },
        fetchedAt: Date.now(),
      });
      return recordsCache.get(cacheKey)!.data as RecordListPageResult;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        recordsCache.set(cacheKey, cachedEntry);
      } else {
        recordsCache.delete(cacheKey);
      }
      throw error;
    });

  recordsCache.set(cacheKey, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export function getCachedRecordDetails(workspaceId: string, recordId: string) {
  return recordDetailCache.get(createRecordDetailCacheKey(workspaceId, recordId))?.data ?? null;
}

export async function getRecordDetails(session: Session, workspaceId: string, recordId: string) {
  const cacheKey = createRecordDetailCacheKey(workspaceId, recordId);
  const cachedEntry = recordDetailCache.get(cacheKey);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, RECORD_DETAIL_CACHE_TTL_MS)) {
    return cachedEntry!.data as RecordDetailResponse;
  }

  const request = invoke<RecordDetailResponse>('record-get', session, {
    workspace_id: workspaceId,
    record_id: recordId,
  })
    .then((detail) => {
      recordDetailCache.set(cacheKey, {
        data: detail,
        fetchedAt: Date.now(),
      });
      updateRecordAcrossListCaches(workspaceId, detail.record);
      return detail;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        recordDetailCache.set(cacheKey, cachedEntry);
      } else {
        recordDetailCache.delete(cacheKey);
      }
      throw error;
    });

  recordDetailCache.set(cacheKey, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export async function createRecord(session: Session, payload: RecordSaveInput) {
  const detail = await invoke<RecordDetailResponse>('record-create', session, payload);
  recordDetailCache.set(createRecordDetailCacheKey(payload.workspace_id, detail.record.id), {
    data: detail,
    fetchedAt: Date.now(),
  });
  invalidateWorkspaceRecordLists(payload.workspace_id);
  return detail;
}

export async function updateRecord(session: Session, recordId: string, payload: RecordSaveInput) {
  const detail = await invoke<RecordDetailResponse>('record-update', session, {
    ...payload,
    record_id: recordId,
  });

  recordDetailCache.set(createRecordDetailCacheKey(payload.workspace_id, recordId), {
    data: detail,
    fetchedAt: Date.now(),
  });
  updateRecordAcrossListCaches(payload.workspace_id, detail.record);
  return detail;
}

export async function moveRecordStage(session: Session, workspaceId: string, recordId: string, stageId: string) {
  const detail = await invoke<RecordDetailResponse>('record-move-stage', session, {
    workspace_id: workspaceId,
    record_id: recordId,
    stage_id: stageId,
  });

  recordDetailCache.set(createRecordDetailCacheKey(workspaceId, recordId), {
    data: detail,
    fetchedAt: Date.now(),
  });
  updateRecordAcrossListCaches(workspaceId, detail.record);
  return detail;
}

export async function addRecordNote(session: Session, workspaceId: string, recordId: string, body: string) {
  const response = await invoke<{ note: RecordNote }>('record-add-note', session, {
    workspace_id: workspaceId,
    record_id: recordId,
    body,
  });

  invalidateRecordDetail(workspaceId, recordId);
  return response.note;
}

export async function createRecordTask(
  session: Session,
  workspaceId: string,
  recordId: string,
  payload: {
    title: string;
    description: string | null;
    priority: string;
    due_at: string | null;
    assigned_to: string | null;
  },
) {
  const response = await invoke<{ task: RecordTask }>('record-create-task', session, {
    workspace_id: workspaceId,
    record_id: recordId,
    ...payload,
  });

  invalidateRecordDetail(workspaceId, recordId);
  return response.task;
}

export async function createImportJob(session: Session, payload: ImportJobInput) {
  return invoke<{
    job: {
      id: string;
      file_name: string;
      status: string;
      total_rows: number | null;
      success_rows: number | null;
      failed_rows: number | null;
      created_at: string;
      updated_at: string;
    };
    importExecutionImplemented: boolean;
    message: string;
  }>('import-job-create', session, payload);
}
