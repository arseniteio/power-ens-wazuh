import type { Logger } from '../../../../src/core/server';
import { normalizeAgentId } from '../../common/agent-configuration';
import { detectAgentSystem } from '../../common/ens/configuration/agents/system-detection';
import { effectiveProfiles, listProfiles } from '../../common/ens/profiles/builtin';
import { ENSHostProfileDocument, hostFactsOf, matchedProfiles } from '../../common/ens/profiles/match';
import { resolveHostParameters } from '../../common/ens/profiles/resolve';
import { ENSProfileCondition, ENS_PROFILE_GROUP_PREFIX } from '../../common/ens/profiles/types';
import { validateProfile } from '../../common/ens/profiles/validate';
import { readActiveENSConfiguration } from './configuration-storage';
import { searchComplete } from './evaluation/search';
import {
  ENSHostFilters,
  HOST_RESULT_WINDOW,
  NO_PROFILE,
  bucketsOf,
  buildHostRequest,
  buildHostSearchRequest,
  buildHostSummaryRequest,
  buildNewestPendingRequest,
  buildPendingRequest,
  buildPreviewRequest,
  pendingParametersOf,
  profileCountsOf,
  totalOf,
} from './hosts/host-queries';
import { readStoredProfiles } from './profiles/profile-storage';

interface Options {
  logger: Logger;
}

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const NO_READ = 'No tienes permiso para leer el índice oscompliance-host-profile, donde el motor deja lo que deduce de cada activo.';

const FILTER_KEYS: Array<keyof ENSHostFilters> = ['distro', 'family', 'role', 'service', 'group', 'profile'];

const filtersOf = (value: any): ENSHostFilters =>
  Object.fromEntries(FILTER_KEYS.filter(key => typeof value?.[key] === 'string' && value[key].trim()).map(key => [key, value[key].trim()]));

const hostRow = (doc: ENSHostProfileDocument, profiles: ReturnType<typeof effectiveProfiles>) => ({
  agentId: doc.agent?.id || '',
  name: doc.agent?.name || '',
  hostname: doc.hostname || '',
  distro: doc.distro || '',
  family: doc.family || '',
  role: doc.role || '',
  services: doc.services || [],
  groups: (doc.groups || []).filter(group => !group.startsWith(ENS_PROFILE_GROUP_PREFIX)),
  os: doc.os || {},
  profiles: matchedProfiles(profiles, hostFactsOf(doc)).map(profile => ({ id: profile.id, name: profile.name, layer: profile.layer })),
  updatedAt: doc['@timestamp'],
});

export const createHostHandlers = ({ logger }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  const profilesOf = async (context: any) => effectiveProfiles(listProfiles(await readStoredProfiles(internal(context), logger)));

  const readFailure = (response: any, error: any, what: string) => {
    const status = statusOf(error);
    if (status === 401 || status === 403) return failure(response, 403, NO_READ);
    logger.error(`Could not read ${what}: ${error?.message || error}`);
    return failure(response, status === 503 ? 503 : 500, `No se pudo leer ${what === 'the host profiles' ? 'el inventario de activos' : 'los datos'}; el detalle está en el log del dashboard.`);
  };

  const search = async (context: any, request: any, response: any) => {
    const body = request?.body || {};
    const page = Math.max(0, Number(body.page) || 0);
    const size = Math.max(1, Math.min(100, Number(body.size) || 25));
    if ((page + 1) * size > HOST_RESULT_WINDOW) {
      return failure(response, 400, `Solo se pueden recorrer las primeras ${HOST_RESULT_WINDOW.toLocaleString('es-ES')} activos; usa la búsqueda o los filtros.`);
    }
    try {
      const profiles = await profilesOf(context);
      const result = await searchComplete(
        actual(context),
        buildHostSearchRequest({ page, size, text: typeof body.text === 'string' ? body.text : '', filters: filtersOf(body.filters) }, profiles),
        'el inventario de activos'
      );
      const aggs = result?.aggregations || {};
      return correct(response, {
        total: totalOf(result),
        page,
        size,
        hosts: (result?.hits?.hits || []).map((hit: any) => hostRow(hit._source || {}, profiles)),
        facets: {
          distro: bucketsOf(aggs.distro),
          family: bucketsOf(aggs.family),
          role: bucketsOf(aggs.role),
          service: bucketsOf(aggs.service),
          group: bucketsOf(aggs.group).filter(bucket => !bucket.value.startsWith(ENS_PROFILE_GROUP_PREFIX)),
          profile: profileCountsOf(aggs.profile),
        },
        profiles: profiles.map(profile => ({ id: profile.id, name: profile.name, layer: profile.layer })),
      });
    } catch (error: any) {
      return readFailure(response, error, 'the host profiles');
    }
  };

  const pending = async (context: any) => {
    const newestBody = await searchComplete(actual(context), buildNewestPendingRequest(), 'los veredictos');
    const newest = newestBody?.aggregations?.newest?.value;
    if (!Number.isFinite(newest)) return { agents: 0, parameters: [], newest: undefined };
    const body = await searchComplete(actual(context), buildPendingRequest(newest), 'los veredictos');
    return { ...pendingParametersOf(body), newest: new Date(newest).toISOString() };
  };

  const summary = async (context: any, _request: any, response: any) => {
    try {
      const profiles = await profilesOf(context);
      const [hosts, unset] = await Promise.all([
        searchComplete(actual(context), buildHostSummaryRequest(profiles), 'el inventario de activos'),
        pending(context).catch(error => {
          logger.warn(`ENS configuration status: could not read the pending parameters: ${error?.message || error}`);
          return undefined;
        }),
      ]);
      const counts = profileCountsOf(hosts?.aggregations?.profile);
      const newest = hosts?.aggregations?.newest?.value;
      return correct(response, {
        total: totalOf(hosts),
        withoutProfile: counts[NO_PROFILE] || 0,
        roles: bucketsOf(hosts?.aggregations?.role),
        distros: bucketsOf(hosts?.aggregations?.distro),
        services: bucketsOf(hosts?.aggregations?.service),
        profiles: profiles.map(profile => ({ id: profile.id, name: profile.name, layer: profile.layer, count: counts[profile.id] || 0 })),
        hostsUpdatedAt: Number.isFinite(newest) ? new Date(newest).toISOString() : undefined,
        pending: unset || null,
      });
    } catch (error: any) {
      return readFailure(response, error, 'the host profiles');
    }
  };

  const preview = async (context: any, request: any, response: any) => {
    const match: ENSProfileCondition[] = Array.isArray(request?.body?.match) ? request.body.match : [];
    const problems = validateProfile({ id: 'vista-previa', name: 'vista previa', layer: 'site', match, values: {} });
    if (problems.length) return correct(response, { total: 0, hosts: [], problems });
    try {
      const result = await searchComplete(actual(context), buildPreviewRequest(match), 'el inventario de activos');
      return correct(response, {
        total: totalOf(result),
        hosts: (result?.hits?.hits || []).map((hit: any) => ({
          agentId: hit._source?.agent?.id || '',
          name: hit._source?.agent?.name || hit._source?.hostname || '',
          distro: hit._source?.distro || '',
          role: hit._source?.role || '',
        })),
        problems: [],
      });
    } catch (error: any) {
      return readFailure(response, error, 'the host profiles');
    }
  };

  const detail = async (context: any, request: any, response: any) => {
    const agentId = normalizeAgentId(request.params.agentId);
    if (!/^\d{3,}$/.test(agentId)) return failure(response, 400, 'El identificador de agente no es válido.');
    try {
      const [result, listed, stored] = await Promise.all([
        searchComplete(actual(context), buildHostRequest(agentId), 'el inventario de activos'),
        readStoredProfiles(internal(context), logger).then(listProfiles),
        readActiveENSConfiguration(internal(context), logger),
      ]);
      const doc: ENSHostProfileDocument | undefined = result?.hits?.hits?.[0]?._source;
      if (!doc) return failure(response, 404, `El motor todavía no ha descrito el activo ${agentId}.`);

      const profiles = effectiveProfiles(listed);
      const matched = matchedProfiles(profiles, hostFactsOf(doc));
      // The engine reads the stored document as it is, so the values are resolved from it unchanged.
      const saved: any = stored?.configuration || {};
      const configuration = {
        controls: Array.isArray(saved.controls) ? saved.controls : [],
        agents: saved.agents && typeof saved.agents === 'object' ? saved.agents : {},
        templates: Array.isArray(saved.templates) ? saved.templates : [],
      };
      const inventoryType = detectAgentSystem({ id: agentId, os: doc.os as any }).type;
      return correct(response, {
        host: { ...hostRow(doc, profiles), signals: doc.signals || [], engineVersion: doc.engine_version || '' },
        matched: matched.map(profile => ({
          id: profile.id,
          name: profile.name,
          layer: profile.layer,
          match: profile.match,
          origin: listed.find(entry => entry.profile.id === profile.id)?.origin || 'stored',
        })),
        hasOwnConfiguration: Boolean(configuration?.agents?.[agentId]),
        parameters: resolveHostParameters({ configuration, agentId, matched, inventoryType }),
      });
    } catch (error: any) {
      return readFailure(response, error, 'the host profiles');
    }
  };

  return { search, summary, preview, detail };
};
