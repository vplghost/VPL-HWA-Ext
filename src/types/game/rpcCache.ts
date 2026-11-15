export interface RpcCall {
  name: string;
  ident?: string | number;
  args?: Record<string, any>;
  [key: string]: any;
}

export interface RpcResult {
  ident?: string | number;
  result?: {
    response?: any;
    [key: string]: any;
  };
  error?: any;
  [key: string]: any;
}

export interface RpcRecord {
  method?: string;
  endpoint?: string;
  status?: number;
  requestBody?: string;
  responseBody?: string;
  timestamp?: string | number;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  key?: string;
  data?: any;
  updatedAt?: string;
  [key: string]: any;
}

export interface CacheEntry<T = any> {
  key: string;
  method?: string;
  feature?: string | null;
  group?: 'heroes' | 'titans' | 'items' | 'teams' | 'events' | 'header' | 'other' | 'internal' | string;
  data: T;
  updatedAt: string;
}

export type RpcCacheState = Record<string, any>;

export interface MergeResult {
  cache: RpcCacheState;
  changed: boolean;
}

export interface PruneResult {
  cache: RpcCacheState;
  changed: boolean;
}

export type RpcExtractor = (record: RpcRecord) => CacheEntry[];

export type DomainReducer = (
  cache: RpcCacheState,
  entry: CacheEntry
) => { handled: boolean; changed: boolean };

export interface RpcCacheModule {
  extract: (record: RpcRecord) => CacheEntry[];
  merge: (cache: RpcCacheState, records: RpcRecord[], maxBytes?: number) => MergeResult;
  definitions: Record<string, string>;
  pruneCache: (cache: RpcCacheState, now?: number) => PruneResult;
}
