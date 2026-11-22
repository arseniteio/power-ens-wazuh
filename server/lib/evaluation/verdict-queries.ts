import { ENS_VERDICTS_INDEX } from '../../../common/constants';
import type { ENSEngineVerdict } from '../../../common/ens/core/engine-verdicts';
import { DEFAULT_ENS_SYSTEM, systemFilter } from '../../../common/ens/systems';

const search = (body: unknown) => ({ index: ENS_VERDICTS_INDEX, ignore_unavailable: true, body });

const ofRow = (controlId: string, agentId: string, system: string) => [
  systemFilter(system),
  { term: { control: controlId } },
  { term: { 'agent.id': agentId } },
];

export const VERDICTS_PROBE_PAGE = 1000;

export const buildVerdictsProbeRequest = (controlIds: string[], from: string, after?: Record<string, string>, system: string = DEFAULT_ENS_SYSTEM) =>
  search({
    size: 0,
    query: {
      bool: {
        filter: [
          systemFilter(system),
          { term: { scope: 'control' } },
          { terms: { control: controlIds } },
          { range: { '@timestamp': { gte: from } } },
        ],
      },
    },
    aggs: {
      rows: {
        composite: {
          size: VERDICTS_PROBE_PAGE,
          sources: [{ control: { terms: { field: 'control' } } }, { agent: { terms: { field: 'agent.id' } } }],
          ...(after ? { after } : {}),
        },
        aggs: { newest: { max: { field: '@timestamp' } }, oldest: { min: { field: '@timestamp' } } },
      },
    },
  });

export type ENSVerdictsProbe = Record<string, Record<string, { newest: string; oldest: string; count: number }>>;

export const addVerdictsProbePage = (probe: ENSVerdictsProbe, body: any): Record<string, string> | undefined => {
  const rows = body?.aggregations?.rows;
  for (const bucket of rows?.buckets || []) {
    if (!Number.isFinite(bucket.newest?.value)) continue;
    const ofControl = (probe[bucket.key.control] = probe[bucket.key.control] || {});
    ofControl[bucket.key.agent] = {
      newest: new Date(bucket.newest.value).toISOString(),
      oldest: new Date(bucket.oldest.value).toISOString(),
      count: bucket.doc_count,
    };
  }
  return (rows?.buckets || []).length === VERDICTS_PROBE_PAGE ? rows?.after_key : undefined;
};

export const buildLatestPassRequest = (controlId: string, agentId: string, newest: string, system: string = DEFAULT_ENS_SYSTEM) =>
  search({
    size: 500,
    query: { bool: { filter: [...ofRow(controlId, agentId, system), { range: { '@timestamp': { gte: newest, lte: newest } } }] } },
  });

export const buildDailyVerdictsRequest = (
  controlId: string,
  agentId: string,
  from: string,
  to: string,
  timeZone: string,
  system: string = DEFAULT_ENS_SYSTEM
) =>
  search({
    size: 0,
    query: {
      bool: {
        filter: [...ofRow(controlId, agentId, system), { term: { scope: 'control' } }, { range: { '@timestamp': { gte: from, lte: to } } }],
      },
    },
    aggs: {
      days: {
        date_histogram: { field: '@timestamp', calendar_interval: 'day', time_zone: timeZone, min_doc_count: 1 },
        aggs: { last: { top_hits: { size: 1, sort: [{ '@timestamp': 'desc' }] } } },
      },
    },
  });

export const dailyVerdictsOf = (body: any): ENSEngineVerdict[] =>
  (body?.aggregations?.days?.buckets || []).flatMap((bucket: any) => (bucket.last?.hits?.hits || []).map((hit: any) => hit._source));

export const verdictsOf = (body: any): ENSEngineVerdict[] => (body?.hits?.hits || []).map((hit: any) => hit._source);
