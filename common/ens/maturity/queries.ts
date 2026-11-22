import { ENS_VERDICTS_INDEX } from '../../constants';
import { DEFAULT_ENS_SYSTEM, systemFilter } from '../systems';
import type { ENSEngineMaturity, ENSOrganizationMaturity } from './types';

export const ENS_ALL_MEASURES = 'ENS';

const PAGE = 1000;

export const buildOrganizationMaturityRequest = (system: string = DEFAULT_ENS_SYSTEM) => ({
  index: ENS_VERDICTS_INDEX,
  ignore_unavailable: true,
  body: {
    size: PAGE,
    query: { bool: { filter: [systemFilter(system), { term: { scope: 'organization' } }, { range: { '@timestamp': { gte: 'now-3d' } } }] } },
    sort: [{ '@timestamp': 'desc' }],
  },
});

// The engine writes the whole organization view at once on each pass: only the newest pass counts.
export const organizationMaturityOf = (body: any): ENSOrganizationMaturity => {
  const hits: any[] = body?.hits?.hits || [];
  const at: string | undefined = hits[0]?._source?.['@timestamp'];
  const measures: Record<string, ENSEngineMaturity> = {};
  let summary: ENSEngineMaturity | undefined;
  for (const hit of hits) {
    const source = hit?._source;
    if (!source || source['@timestamp'] !== at || !source.maturity) continue;
    if (source.control === ENS_ALL_MEASURES) summary = source.maturity;
    else measures[source.control] = source.tally ? { ...source.maturity, tally: source.tally } : source.maturity;
  }
  return { at, summary, measures };
};
