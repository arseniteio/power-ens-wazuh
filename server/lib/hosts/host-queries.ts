import { ENS_HOST_PROFILE_INDEX, ENS_VERDICTS_INDEX } from '../../../common/constants';
import { noProfileQuery, profileQuery } from '../../../common/ens/profiles/match';
import type { ENSProfile, ENSProfileCondition } from '../../../common/ens/profiles/types';

// OpenSearch refuses from + size beyond index.max_result_window, 10000 by default.
export const HOST_RESULT_WINDOW = 10000;
export const NO_PROFILE = '__none__';

export interface ENSHostFilters {
  distro?: string;
  family?: string;
  role?: string;
  service?: string;
  group?: string;
  profile?: string;
}

export interface ENSHostSearch {
  page: number;
  size: number;
  text?: string;
  filters: ENSHostFilters;
}

type Query = Record<string, unknown>;

const caseless = (field: string, value: string): Query => ({ term: { [field]: { value, case_insensitive: true } } });

const escapeWildcard = (text: string): string => text.replace(/[\\*?]/g, '\\$&');

const HOST_TEXT_FIELDS = ['agent.name', 'hostname', 'agent.id', 'groups', 'distro', 'services'];

const textQuery = (text: string): Query | undefined => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  return {
    bool: {
      filter: words.map(word => ({
        bool: {
          should: HOST_TEXT_FIELDS.map(field => ({
            wildcard: { [field]: { value: `*${escapeWildcard(word)}*`, case_insensitive: true } },
          })),
          minimum_should_match: 1,
        },
      })),
    },
  };
};

const FILTER_FIELDS: Record<Exclude<keyof ENSHostFilters, 'profile'>, string> = {
  distro: 'distro',
  family: 'family',
  role: 'role',
  service: 'services',
  group: 'groups',
};

export const hostFilterQuery = (search: Pick<ENSHostSearch, 'text' | 'filters'>, profiles: ENSProfile[]): Query => {
  const filter: Query[] = [];
  const byText = search.text ? textQuery(search.text) : undefined;
  if (byText) filter.push(byText);
  (Object.keys(FILTER_FIELDS) as Array<keyof typeof FILTER_FIELDS>).forEach(key => {
    const value = search.filters[key];
    if (value) filter.push(caseless(FILTER_FIELDS[key], value));
  });
  const profileId = search.filters.profile;
  if (profileId === NO_PROFILE) filter.push(noProfileQuery(profiles));
  else if (profileId) {
    const profile = profiles.find(p => p.id === profileId);
    filter.push(profile ? profileQuery(profile) : { match_none: {} });
  }
  return filter.length ? { bool: { filter } } : { match_all: {} };
};

const facet = (field: string, size: number) => ({ terms: { field, size, order: [{ _count: 'desc' }, { _key: 'asc' }] } });

export const profileCountsAggregation = (profiles: ENSProfile[]) => ({
  filters: {
    filters: {
      ...Object.fromEntries(profiles.map(profile => [profile.id, profileQuery(profile)])),
      [NO_PROFILE]: noProfileQuery(profiles),
    },
  },
});

export const HOST_SOURCE_FIELDS = ['agent', 'hostname', 'groups', 'os', 'distro', 'family', 'role', 'services', '@timestamp', 'engine_version'];

export const buildHostSearchRequest = (search: ENSHostSearch, profiles: ENSProfile[]) => {
  const size = Math.max(1, Math.min(100, search.size));
  const from = Math.max(0, search.page) * size;
  return {
    index: ENS_HOST_PROFILE_INDEX,
    ignore_unavailable: true,
    body: {
      from: Math.min(from, HOST_RESULT_WINDOW - size),
      size,
      track_total_hits: true,
      _source: HOST_SOURCE_FIELDS,
      query: hostFilterQuery(search, profiles),
      sort: [{ 'agent.name': { order: 'asc', missing: '_last' } }, { 'agent.id': { order: 'asc' } }],
      aggs: {
        distro: facet('distro', 50),
        family: facet('family', 20),
        role: facet('role', 20),
        service: facet('services', 50),
        group: facet('groups', 100),
        profile: profileCountsAggregation(profiles),
      },
    },
  };
};

export const buildHostSummaryRequest = (profiles: ENSProfile[]) => ({
  index: ENS_HOST_PROFILE_INDEX,
  ignore_unavailable: true,
  body: {
    size: 0,
    track_total_hits: true,
    query: { match_all: {} },
    aggs: {
      role: facet('role', 20),
      distro: facet('distro', 50),
      service: facet('services', 50),
      profile: profileCountsAggregation(profiles),
      newest: { max: { field: '@timestamp' } },
    },
  },
});

export const buildPreviewRequest = (match: ENSProfileCondition[]) => ({
  index: ENS_HOST_PROFILE_INDEX,
  ignore_unavailable: true,
  body: {
    size: 6,
    track_total_hits: true,
    _source: ['agent', 'hostname', 'distro', 'role'],
    query: profileQuery({ match }),
    sort: [{ 'agent.name': { order: 'asc', missing: '_last' } }],
  },
});

export const buildHostRequest = (agentId: string) => ({
  index: ENS_HOST_PROFILE_INDEX,
  ignore_unavailable: true,
  body: { size: 1, query: { ids: { values: [agentId] } } },
});

export interface ENSFacetBucket {
  value: string;
  count: number;
}

export const bucketsOf = (aggregation: any): ENSFacetBucket[] =>
  (aggregation?.buckets || []).map((bucket: any) => ({ value: String(bucket.key), count: bucket.doc_count }));

export const profileCountsOf = (aggregation: any): Record<string, number> =>
  Object.fromEntries(Object.entries(aggregation?.buckets || {}).map(([id, bucket]: [string, any]) => [id, bucket.doc_count]));

export const totalOf = (body: any): number => {
  const total = body?.hits?.total;
  return typeof total === 'number' ? total : Number(total?.value) || 0;
};

const NOT_EVALUABLE_BY_CONFIGURATION = [
  { term: { scope: 'evidence' } },
  { term: { status: 'NOT_EVALUABLE' } },
  { term: { cause: 'CONFIGURATION' } },
];

export const buildNewestPendingRequest = () => ({
  index: ENS_VERDICTS_INDEX,
  ignore_unavailable: true,
  body: { size: 0, query: { term: { scope: 'evidence' } }, aggs: { newest: { max: { field: '@timestamp' } } } },
});

// One pass of the engine writes every verdict within minutes; 20 minutes before the
// newest one covers the last pass without counting the one before twice.
export const PASS_WINDOW_MS = 20 * 60 * 1000;

export const buildPendingRequest = (newest: number) => ({
  index: ENS_VERDICTS_INDEX,
  ignore_unavailable: true,
  body: {
    size: 0,
    query: {
      bool: {
        filter: [
          ...NOT_EVALUABLE_BY_CONFIGURATION,
          { range: { '@timestamp': { gte: new Date(newest - PASS_WINDOW_MS).toISOString(), lte: new Date(newest).toISOString() } } },
        ],
      },
    },
    aggs: {
      agents: { cardinality: { field: 'agent.id' } },
      unset: {
        filter: { term: { reason_code: 'param.not_set' } },
        aggs: {
          controls: {
            terms: { field: 'control', size: 100 },
            aggs: {
              evidences: {
                terms: { field: 'evidence', size: 100 },
                aggs: {
                  agents: { cardinality: { field: 'agent.id' } },
                  samples: { top_hits: { size: 20, _source: ['reason_args'] } },
                },
              },
            },
          },
        },
      },
    },
  },
});

export interface ENSPendingParameter {
  controlId: string;
  parameterId: string;
  evidences: string[];
  agents: number;
}

export const pendingParametersOf = (body: any): { agents: number; parameters: ENSPendingParameter[] } => {
  const byKey = new Map<string, ENSPendingParameter>();
  for (const control of body?.aggregations?.unset?.controls?.buckets || []) {
    for (const evidence of control.evidences?.buckets || []) {
      const params = new Set<string>(
        (evidence.samples?.hits?.hits || []).map((hit: any) => hit._source?.reason_args?.param).filter((p: unknown) => typeof p === 'string' && p)
      );
      params.forEach(param => {
        // A control that reads another control's parameter names it as "<control> <parameter>".
        const [controlId, parameterId] = param.includes(' ') ? param.split(/\s+/, 2) : [String(control.key), param];
        const key = `${controlId}|${parameterId}`;
        const entry = byKey.get(key) || { controlId, parameterId, evidences: [], agents: 0 };
        entry.evidences.push(controlId === String(control.key) ? String(evidence.key) : `${control.key} ${evidence.key}`);
        entry.agents = Math.max(entry.agents, evidence.agents?.value || 0);
        byKey.set(key, entry);
      });
    }
  }
  const parameters = Array.from(byKey.values()).sort((a, b) => b.agents - a.agents || b.evidences.length - a.evidences.length || a.controlId.localeCompare(b.controlId));
  return { agents: body?.aggregations?.agents?.value || 0, parameters };
};
