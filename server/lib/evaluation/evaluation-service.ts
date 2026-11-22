import { createHash } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';
import type { Logger } from '../../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../../common/constants';
import { buildMonitoringInventoryRequest, inventoryFromMonitoring } from '../../../common/agents/agent-inventory';
import { ENSCatalog } from '../../../common/ens/catalog';
import { defaultENSConfigurationTemplate } from '../../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../../common/ens/configuration/repository';
import {
  assertENSConfigurationVersion,
} from '../../../common/ens/configuration/services/configuration-structure-validator';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { toTemplateModel } from '../../../common/ens/configuration/agents/configuration-resolver';
import { withInventoryTypes } from '../../../common/ens/configuration/agents/system-detection';
import { normalizeOrganizationData } from '../../../common/ens/configuration/organization/organization-data-migration';
import { buildComplianceState } from '../../../common/ens/core/compliance-state';
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import { assembleState, consolidateRows, resultStatusStub } from '../../../common/ens/core/control-views';
import type { ENSControlView } from '../../../common/ens/core/control-views';
import type { ENSComplianceResult, ENSTraceabilityResult } from '../../../common/ens/core/evaluation/types';
import { buildENSResultFromVerdicts, verdictSeriesPoints } from '../../../common/ens/core/engine-verdicts';
import { normalizeInventory, resolveENSScopeAgents } from '../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import { planENSTimelineCuts, startOfDayIn } from '../../../common/ens/core/timeline/timeline-cuts';
import type { ENSTimelineCutPlan } from '../../../common/ens/core/timeline/timeline-cuts';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { listENSSystems, readActiveENSConfiguration } from '../configuration-storage';
import { configurationDocumentId, isDefaultSystem, isValidSystemId, machinesOfSystem, systemOf } from '../../../common/ens/systems';
import { resolveCurrentUser } from '../current-user';
import { Cancellable, CancelSignal, EVALUATION_TTL_MS, EvaluationCache, Semaphore } from './cache';
import { searchComplete, throwIfCancelled } from './search';
import { activityOf, catalogControlIds, resolveEvaluationWindow } from './window';
import type { ENSEvaluationWindow, ENSVerdictActivity } from './window';
import {
  addVerdictsProbePage,
  buildDailyVerdictsRequest,
  buildLatestPassRequest,
  buildVerdictsProbeRequest,
  dailyVerdictsOf,
  verdictsOf,
} from './verdict-queries';
import type { ENSVerdictsProbe } from './verdict-queries';
import { overviewQueryFlags, perControlOfPoint, perControlOfResults } from './overview-fields';

type ENSEvaluationInclude = 'summary' | 'results' | 'dashboard' | 'control' | 'overview';

interface ENSEvaluationQuery {
  system?: string;
  agentId?: string;
  controlId?: string;
  include: ENSEvaluationInclude;
  timelineDays?: number;
  timeZone: string;
  timelineControls?: boolean;
}

interface ENSEvaluationClients {
  asCurrentUser: any;
  asInternalUser: any;
}

export class ENSBadRequestError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ENSBadRequestError';
  }
}

const normalizeAgentId = (value: string): string => {
  const text = value.trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

// Math.min(...values) overflows the call stack once a deployment has some 100,000 control and machine rows.
export const smallest = (values: number[]): number => values.reduce((least, value) => (value < least ? value : least), Infinity);

const sha = (...parts: unknown[]): string => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

const isValidTimeZone = (timeZone?: string): boolean => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const normalizeQuery = (query: Record<string, unknown>): ENSEvaluationQuery => {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const controlId = text(query.controlId);
  if (controlId && !ENSCatalog.some(control => control.id === controlId)) {
    throw new ENSBadRequestError(`El control «${controlId}» no está en el catálogo de Power ENS.`);
  }
  const agentName = text(query.agentId);
  const agentId = agentName ? normalizeAgentId(agentName) : undefined;
  if (agentName && (!agentId || agentId.length > 64)) {
    throw new ENSBadRequestError(`«${agentName}» no es un identificador de máquina válido.`);
  }
  const zone = text(query.timeZone);
  if (zone && !isValidTimeZone(zone)) {
    throw new ENSBadRequestError(`«${zone}» no es una zona horaria IANA válida.`);
  }
  const include = text(query.include);
  if (include && !['summary', 'results', 'dashboard', 'control', 'overview'].includes(include)) {
    throw new ENSBadRequestError(`Vista desconocida: «${include}».`);
  }
  if (include === 'overview' && controlId) {
    throw new ENSBadRequestError('La Vista general es de todos los controles: sin «controlId».');
  }
  const system = systemOf(query.system);
  if (!isDefaultSystem(system) && !isValidSystemId(system)) {
    throw new ENSBadRequestError(`«${system}» no es un identificador de sistema ENS válido.`);
  }
  const days = query.timelineDays === undefined || query.timelineDays === '' ? 0 : Number(query.timelineDays);
  if (!Number.isInteger(days) || days < 0 || days > ENS_EVALUATION_LIMITS.maxTimelineDays) {
    throw new ENSBadRequestError(`Los días de la serie van de 0 a ${ENS_EVALUATION_LIMITS.maxTimelineDays}.`);
  }
  return {
    system,
    agentId,
    controlId,
    include: (include as ENSEvaluationInclude) || (controlId ? 'control' : 'summary'),
    timelineDays: days,
    timeZone: zone || 'UTC',
    ...overviewQueryFlags(query),
  };
};

interface ENSEvaluationContext {
  now: Date;
  system: string;
  userKey: string;
  configuration: ENSConfigurationVersion;
  configurationKey: string;
  configurationUpdatedAt?: string;
  scope: ENSAgentScope[];
  scopeKey: string;
  inventory: { stale: boolean; newestTimestamp?: string; agents: number };
  window: ENSEvaluationWindow;
  verdicts: ENSVerdictsProbe;
  activity: ENSVerdictActivity;
  timeZone: string;
}

interface CutPoint {
  status: string;
  score?: number;
  machines?: number;
}

interface StoredCuts {
  key: string;
  points: Record<string, CutPoint>;
}

interface StoredRow {
  result: ENSComplianceResult;
  traceability: Buffer | null;
  traceabilityTotal: number;
  cuts: StoredCuts;
  configurationKey: string;
  scopeKey: string;
  refreshError?: { message: string; at: string };
}

const compress = (list: ENSTraceabilityResult[]): Buffer | null =>
  list.length ? deflateRawSync(Buffer.from(JSON.stringify(list), 'utf8')) : null;

const decompressTraceability = (data: Buffer | null): ENSTraceabilityResult[] =>
  data ? JSON.parse(inflateRawSync(data).toString('utf8')) : [];

const storedRowBytes = (row: StoredRow): number =>
  JSON.stringify(row.result).length + (row.traceability?.length || 0) + ENS_EVALUATION_LIMITS.maxTimelineDays * 80 + 512;

const withoutTraceability = (result: ENSComplianceResult): ENSComplianceResult => ({ ...result, traceability: [] });

const readConfigurationStamp = async (client: any, system: string): Promise<string | undefined> => {
  const body = await searchComplete(
    client,
    {
      index: ENS_CONFIGURATION_INDEX,
      ignore_unavailable: true,
      body: { size: 1, seq_no_primary_term: true, query: { ids: { values: [configurationDocumentId(system)] } }, _source: ['updatedAt', 'configuration.updatedAt'] },
    },
    'la configuración ENS'
  );
  const hit = body?.hits?.hits?.[0];
  const doc = hit?._source;
  return doc ? `${doc.updatedAt || ''}|${doc.configuration?.updatedAt || ''}|${hit._seq_no ?? ''}|${hit._primary_term ?? ''}` : undefined;
};

interface ENSEvaluationServiceOptions {
  logger: Logger;
  securityEnabled: boolean;
  clock?: () => Date;
  maxConcurrentReads?: number;
  maxStoredBytes?: number;
  firstResponseMs?: number;
}

interface ENSRunOptions {
  allowStale?: boolean;
  signal?: Cancellable;
  retryRefresh?: boolean;
}

interface ENSViewPartition {
  controlId: string;
  result?: ENSComplianceResult;
  traceability: () => ENSTraceabilityResult[];
  traceabilityStored: number;
  traceabilityTotal: number;
  rows: { agentId: string; result: ENSComplianceResult }[];
  pointAt: (cutoffIso: string) => CutPoint | null | undefined;
}

const FIRST_RESPONSE_MS = 1500;
const PROGRESSIVE: ENSEvaluationInclude[] = ['summary', 'overview', 'dashboard'];
const COLD_FAILURE_MS = 30 * 1000;
const waitAfterFailureMs = (failures: number): number => Math.min(5 * 60 * 1000, 30 * 1000 * 2 ** Math.max(0, failures - 1));

interface RowNeed {
  key: string;
  fingerprint: string;
  controlId: string;
  agentId: string;
}

interface UsedRow {
  need: RowNeed;
  row: StoredRow;
  storedAt: number;
  stale: boolean;
  computed: boolean;
}

export const createEvaluationService = ({
  logger,
  securityEnabled,
  clock = () => new Date(),
  maxConcurrentReads = 4,
  maxStoredBytes = 64 * 1024 * 1024,
  firstResponseMs = FIRST_RESPONSE_MS,
}: ENSEvaluationServiceOptions) => {
  const clockValue = () => clock().getTime();
  const rows = new EvaluationCache<StoredRow>(20000, EVALUATION_TTL_MS, clockValue, maxStoredBytes, storedRowBytes);
  const verdictProbes = new EvaluationCache<ENSVerdictsProbe>(100, 60 * 1000, clockValue);
  const inventories = new EvaluationCache<{ agents: ENSAgentScope[]; stale: boolean; newestTimestamp?: string }>(100, 60 * 1000, clockValue);
  const configurations = new EvaluationCache<{ configuration: ENSConfigurationVersion; updatedAt?: string; key: string }>(4, 24 * 3600 * 1000, clockValue);
  const reads = new Semaphore(maxConcurrentReads);
  const inflight = new Map<string, Promise<StoredRow>>();
  const refreshFailures = new Map<string, { failures: number; nextAt: number }>();
  const coldFailures = new Map<string, { error: unknown; at: number }>();


  const loadConfiguration = async (clients: ENSEvaluationClients, system: string, stamp: string) => {
    const cached = configurations.get(system, stamp);
    if (cached) return cached;
    const stored = await readActiveENSConfiguration(clients.asInternalUser, logger, system);
    if (!stored && !isDefaultSystem(system)) throw new ENSBadRequestError(`El sistema ENS «${system}» no existe.`);
    const configuration = stored?.configuration
      ? normalizeOrganizationData(toTemplateModel(assertENSConfigurationVersion(stored.configuration))).configuration
      : (defaultENSConfigurationTemplate as ENSConfigurationVersion);
    const entry = { configuration, updatedAt: stored?.updatedAt || (configuration as any).updatedAt, key: sha(stamp, stored?.configuration || 'default') };
    configurations.set(system, stamp, entry);
    return entry;
  };

  const loadVerdictsProbe = async (clients: ENSEvaluationClients, userKey: string, from: string, system: string): Promise<ENSVerdictsProbe> => {
    const cached = verdictProbes.get(userKey, 'verdicts');
    if (cached) return cached;
    const probe: ENSVerdictsProbe = {};
    let after: Record<string, string> | undefined;
    do {
      const body = await searchComplete(clients.asCurrentUser, buildVerdictsProbeRequest(catalogControlIds(), from, after, system), 'los veredictos del motor');
      after = addVerdictsProbePage(probe, body);
    } while (after);
    verdictProbes.set(userKey, 'verdicts', probe);
    return probe;
  };

  const loadInventory = async (clients: ENSEvaluationClients, userKey: string, now: Date) => {
    const cached = inventories.get(userKey, 'inventory');
    if (cached) return cached;
    const body = await searchComplete(clients.asCurrentUser, buildMonitoringInventoryRequest(), 'el inventario de agentes');
    const read = inventoryFromMonitoring(body?.aggregations, now.getTime());
    const inventory = { agents: normalizeInventory(read.agents), stale: read.stale, newestTimestamp: read.newestTimestamp };
    inventories.set(userKey, 'inventory', inventory);
    return inventory;
  };

  const loadContext = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery): Promise<ENSEvaluationContext> => {
    const now = clock();
    const user = await resolveCurrentUser(clients.asCurrentUser, securityEnabled);
    const system = systemOf(query.system);
    const userKey = `${system}|${user.username}|${[...user.roles].sort().join(',')}`;
    const stamp = await readConfigurationStamp(clients.asInternalUser, system);
    const stored = await loadConfiguration(clients, system, stamp || 'default');
    const systems = await listENSSystems(clients.asInternalUser, logger);
    const inventory = await loadInventory(clients, userKey, now);
    const configuration = withInventoryTypes(stored.configuration, inventory.agents);
    const configurationKey = sha(stored.key, configuration.agents || null);
    const updatedAt = stored.updatedAt;
    const scope = machinesOfSystem(system, resolveENSScopeAgents(inventory.agents, configuration.scope), inventory.agents, systems);
    if (query.agentId && !scope.some(agent => agent.id === query.agentId)) {
      throw new ENSBadRequestError(`La máquina ${query.agentId} no está en un grupo ENS evaluable.`);
    }
    const window = resolveEvaluationWindow(configuration.global.evaluationPeriod, now);
    const verdicts = await loadVerdictsProbe(clients, userKey, window.from, system);

    return {
      now,
      system,
      userKey,
      configuration,
      configurationKey,
      configurationUpdatedAt: updatedAt,
      scope,
      scopeKey: sha(scope.map(agent => [agent.id, agent.name, agent.groups])),
      inventory: { stale: inventory.stale, newestTimestamp: inventory.newestTimestamp, agents: inventory.agents.length },
      window,
      verdicts,
      activity: activityOf(verdicts, scope),
      timeZone: query.timeZone,
    };
  };

  const controlsOf = (query: ENSEvaluationQuery): string[] => (query.controlId ? [query.controlId] : catalogControlIds());

  const rowAgentsOf = (ctx: ENSEvaluationContext, controlId: string): ENSAgentScope[] =>
    ctx.scope.filter(agent => ctx.verdicts[controlId]?.[agent.id]);

  const seriesKeyOf = (ctx: ENSEvaluationContext) => sha(ctx.timeZone, startOfDayIn(ctx.now, ctx.timeZone).toISOString());

  const rowFingerprint = (ctx: ENSEvaluationContext, controlId: string, agentId: string): string =>
    sha(ctx.configurationKey, ctx.scopeKey, seriesKeyOf(ctx), controlId, agentId, ctx.verdicts[controlId]?.[agentId]?.newest || null);

  const viewFingerprint = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): string =>
    sha(
      ctx.configurationKey,
      ctx.scopeKey,
      query.agentId || '*',
      controlsOf(query).map(controlId => rowAgentsOf(ctx, controlId).map(agent => rowFingerprint(ctx, controlId, agent.id)))
    );

  const seriesCutsOf = (ctx: ENSEvaluationContext): Date[] => {
    const days = Math.min(
      ENS_EVALUATION_LIMITS.maxTimelineDays,
      Math.max(1, Math.ceil((Date.parse(ctx.window.to) - Date.parse(ctx.window.from)) / 86400e3) + 1)
    );
    return planENSTimelineCuts(Date.parse(ctx.window.from), 1, { now: ctx.now, days, timeZone: ctx.timeZone, maxEvaluatedEvents: Infinity })
      .filter(cut => !cut.isCurrent)
      .map(cut => cut.cutoff);
  };


  const computeRow = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, need: RowNeed, signal: Cancellable, background: boolean): Promise<StoredRow> =>
    reads.use(async () => {
      throwIfCancelled(signal);
      const { controlId, agentId } = need;
      const newest = ctx.verdicts[controlId]?.[agentId]?.newest as string;
      const subject = `${controlId} en ${agentId}`;
      const [latest, daily] = await Promise.all([
        searchComplete(clients.asCurrentUser, buildLatestPassRequest(controlId, agentId, newest, ctx.system), `los veredictos de ${subject}`),
        searchComplete(clients.asCurrentUser, buildDailyVerdictsRequest(controlId, agentId, ctx.window.from, ctx.now.toISOString(), ctx.timeZone, ctx.system), `la serie de ${subject}`),
      ]);
      throwIfCancelled(signal);
      ensConfigurationRepository.replaceActive(ctx.configuration);
      const result = buildENSResultFromVerdicts(controlId, ctx.configuration.global.ensLevel, agentId, verdictsOf(latest), ctx.now);
      return {
        result: withoutTraceability(result),
        traceability: compress(result.traceability),
        traceabilityTotal: result.traceability.length,
        cuts: { key: seriesKeyOf(ctx), points: verdictSeriesPoints(seriesCutsOf(ctx), dailyVerdictsOf(daily)) },
        configurationKey: ctx.configurationKey,
        scopeKey: ctx.scopeKey,
      };
    }, { background });

  const ensureRows = (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    needs: RowNeed[],
    o: { background: boolean; signal?: Cancellable; onFailed?: (need: RowNeed, error: unknown) => void }
  ): Map<string, Promise<StoredRow>> => {
    const output = new Map<string, Promise<StoredRow>>();
    for (const need of needs) {
      const id = `${need.key}|${need.fingerprint}`;
      let promise = inflight.get(id);
      if (!promise) {
        const signal = o.background || !o.signal ? new CancelSignal() : o.signal;
        promise = computeRow(clients, ctx, need, signal, o.background).then(
          row => {
            inflight.delete(id);
            refreshFailures.delete(need.key);
            coldFailures.delete(need.key);
            rows.set(need.key, need.fingerprint, row);
            return row;
          },
          error => {
            inflight.delete(id);
            o.onFailed?.(need, error);
            throw error;
          }
        );
        promise.catch(() => undefined);
        inflight.set(id, promise);
      }
      output.set(need.key, promise);
    }
    return output;
  };

  const refreshStale = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, stale: RowNeed[], options: ENSRunOptions): number => {
    const now = clock().getTime();
    const due = stale.filter(need => {
      if (inflight.has(`${need.key}|${need.fingerprint}`)) return false;
      const failure = refreshFailures.get(need.key);
      return !(failure && failure.nextAt > now && !options.retryRefresh);
    });
    ensureRows(clients, ctx, due, {
      background: true,
      onFailed: (need, error: any) => {
        const failures = (refreshFailures.get(need.key)?.failures || 0) + 1;
        refreshFailures.set(need.key, { failures, nextAt: clock().getTime() + waitAfterFailureMs(failures) });
        const stored = rows.peek(need.key);
        if (stored) stored.value.refreshError = { message: String(error?.message || error), at: clock().toISOString() };
        logger.warn(`Power ENS: could not refresh ${need.key}: ${error?.message || error}`);
      },
    });
    return due.length;
  };


  const timelinePlan = (ctx: ENSEvaluationContext, query: ENSEvaluationQuery): ENSTimelineCutPlan[] => {
    if (!query.timelineDays) return [];
    const stamps = controlsOf(query).flatMap(controlId =>
      Object.entries(ctx.verdicts[controlId] || {})
        .filter(([agentId]) => !query.agentId || agentId === query.agentId)
        .map(([, stamp]) => stamp)
    );
    const first = stamps.length ? smallest(stamps.map(stamp => Date.parse(stamp.oldest))) : undefined;
    return planENSTimelineCuts(first, stamps.reduce((n, stamp) => n + stamp.count, 0), {
      now: ctx.now,
      days: query.timelineDays,
      timeZone: query.timeZone,
      maxEvaluatedEvents: Infinity,
    });
  };

  const viewOf = (
    ctx: ENSEvaluationContext,
    query: ENSEvaluationQuery,
    controlId: string,
    controlRows: { agent: ENSAgentScope; row: StoredRow }[]
  ): ENSViewPartition => {
    if (query.agentId) {
      const own = controlRows.find(entry => entry.agent.id === query.agentId)?.row;
      return {
        controlId,
        result: own?.result,
        traceability: () => (own ? decompressTraceability(own.traceability) : []),
        traceabilityStored: own ? Math.min(own.traceabilityTotal, ENS_EVALUATION_LIMITS.traceabilityStored) : 0,
        traceabilityTotal: own?.traceabilityTotal || 0,
        rows: own ? [{ agentId: query.agentId, result: own.result }] : [],
        pointAt: iso => (own ? { ...(own.cuts.points[iso] || { status: 'NO_EVALUABLE' }), machines: own.cuts.points[iso] ? 1 : 0 } : null),
      };
    }

    const withTraces = query.include === 'control';
    const views: ENSControlView[] = controlRows.map(({ agent, row }) => ({
      agentId: agent.id,
      agentName: agent.name,
      result: { ...row.result, traceability: withTraces ? decompressTraceability(row.traceability) : [] },
    }));
    ensConfigurationRepository.replaceActive(ctx.configuration);
    const consolidated = views.length
      ? consolidateRows(controlId, views)
      : buildENSResultFromVerdicts(controlId, ctx.configuration.global.ensLevel, undefined, [], ctx.now);
    const trace = (consolidated?.traceability || []).slice(0, ENS_EVALUATION_LIMITS.traceabilityStored);
    return {
      controlId,
      result: consolidated && withoutTraceability(consolidated),
      traceability: () => trace,
      traceabilityStored: trace.length,
      traceabilityTotal: controlRows.reduce((n, { row }) => n + row.traceabilityTotal, 0),
      rows: views.map(view => ({ agentId: view.agentId, result: withoutTraceability(view.result) })),
      pointAt: iso => {
        if (!controlRows.length) return null;
        const atCut = consolidateRows(
          controlId,
          controlRows.map(({ agent, row }) => {
            const point = row.cuts.points[iso];
            return { agentId: agent.id, agentName: agent.name, result: resultStatusStub(controlId, point?.status || 'NO_EVALUABLE', point?.score) };
          })
        );
        const machines = controlRows.filter(({ row }) => row.cuts.points[iso]).length;
        return atCut ? { status: atCut.status, score: atCut.score, machines } : null;
      },
    };
  };

  const timelineOf = (
    ctx: ENSEvaluationContext,
    query: ENSEvaluationQuery,
    controls: string[],
    views: Map<string, ENSViewPartition>,
    state: ENSComplianceState | undefined
  ) =>
    timelinePlan(ctx, query).map(cut => {
      const iso = cut.cutoff.toISOString();
      const base = { date: iso, label: cut.label, isCurrent: cut.isCurrent };
      if (query.controlId) {
        const view = views.get(query.controlId);
        if (cut.isCurrent) return { ...base, score: view?.result?.score, status: view?.result?.status || 'NO_EVALUABLE', events: view?.rows.length || 0 };
        const at = view?.pointAt(iso);
        return { ...base, score: at?.score, status: at?.status || 'NO_EVALUABLE', events: at?.machines || 0 };
      }
      if (cut.isCurrent) {
        const events = controls.reduce((n, controlId) => n + (views.get(controlId)?.rows.length || 0), 0);
        return { ...base, events, score: state!.controlSummary.scoreAverage, controls: perControlOfResults(state!.results) };
      }
      const points = controls.map(controlId => views.get(controlId)?.pointAt(iso));
      const events = points.reduce((n, point) => n + (point?.machines || 0), 0);
      const results = controls
        .map((controlId, i) => (points[i] ? resultStatusStub(controlId, points[i]!.status, points[i]!.score) : undefined))
        .filter((r): r is ENSComplianceResult => Boolean(r));
      return { ...base, events, score: buildComplianceState(results).controlSummary.scoreAverage, controls: perControlOfPoint(controls, points) };
    });

  const run = async (clients: ENSEvaluationClients, query: ENSEvaluationQuery, options: ENSRunOptions = {}) => {
    const started = Date.now();
    const ctx = await loadContext(clients, query);
    const controls = controlsOf(query);
    const progressive = PROGRESSIVE.includes(query.include);

    const needsOf = new Map<string, { agent: ENSAgentScope; need: RowNeed }[]>();
    const needs: RowNeed[] = [];
    for (const controlId of controls) {
      const list = rowAgentsOf(ctx, controlId)
        .filter(agent => !query.agentId || agent.id === query.agentId)
        .map(agent => {
          const need = { key: `r|${ctx.userKey}|${controlId}|${agent.id}`, fingerprint: rowFingerprint(ctx, controlId, agent.id), controlId, agentId: agent.id };
          needs.push(need);
          return { agent, need };
        });
      needsOf.set(controlId, list);
    }
    rows.setMaxBytes(Math.min(maxStoredBytes * 4, Math.max(maxStoredBytes, needs.length * 60 * 1024 * 10)));

    const ready = new Map<string, UsedRow>();
    const stale: RowNeed[] = [];
    const cold: RowNeed[] = [];
    for (const need of needs) {
      const entry = rows.peek(need.key);
      if (entry && rows.isFresh(entry, need.fingerprint)) {
        ready.set(need.key, { need, row: entry.value, storedAt: entry.storedAt, stale: false, computed: false });
      } else if (options.allowStale && entry && entry.value.configurationKey === ctx.configurationKey && entry.value.scopeKey === ctx.scopeKey) {
        ready.set(need.key, { need, row: entry.value, storedAt: entry.storedAt, stale: true, computed: false });
        stale.push(need);
      } else {
        const failure = coldFailures.get(need.key);
        if (failure) {
          coldFailures.delete(need.key);
          if (!inflight.has(`${need.key}|${need.fingerprint}`) && !options.retryRefresh && clock().getTime() - failure.at < COLD_FAILURE_MS) {
            throw failure.error;
          }
        }
        cold.push(need);
      }
    }
    const refreshingInBackground = refreshStale(clients, ctx, stale, options);

    const promises = ensureRows(clients, ctx, cold, {
      background: progressive,
      signal: options.signal,
      onFailed: (need, error: any) => {
        if (error?.statusCode !== 499) coldFailures.set(need.key, { error, at: clock().getTime() });
      },
    });
    const errors: unknown[] = [];
    const tracking = cold.map(need =>
      promises.get(need.key)!.then(
        row => ready.set(need.key, { need, row, storedAt: clock().getTime(), stale: false, computed: true }),
        error => errors.push(error)
      )
    );
    if (progressive) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.all(tracking), new Promise<void>(resolve => (timer = setTimeout(resolve, firstResponseMs)))]);
      if (timer) clearTimeout(timer);
    } else {
      await Promise.all(tracking);
    }
    if (errors.length) {
      for (const need of cold) coldFailures.delete(need.key);
      throw errors[0];
    }

    const views = new Map<string, ENSViewPartition>();
    const pending: string[] = [];
    for (const controlId of controls) {
      const list = needsOf.get(controlId) || [];
      if (list.some(({ need }) => !ready.has(need.key))) {
        pending.push(controlId);
        continue;
      }
      views.set(controlId, viewOf(ctx, query, controlId, list.map(({ agent, need }) => ({ agent, row: ready.get(need.key)!.row }))));
    }

    const state = query.controlId
      ? undefined
      : assembleState(
          controls.filter(controlId => views.has(controlId)).map(controlId => ({ controlId, result: views.get(controlId)!.result, rows: views.get(controlId)!.rows })),
          query.agentId ? ctx.scope.filter(agent => agent.id === query.agentId) : ctx.scope
        );
    const timeline = query.timelineDays && !pending.length ? timelineOf(ctx, query, controls, views, state) : undefined;

    const used = [...ready.values()];
    const refreshing = used.some(u => u.stale) || pending.length > 0;
    const fingerprint = viewFingerprint(ctx, query);
    const refreshError = used
      .filter(u => u.stale && !inflight.has(`${u.need.key}|${u.need.fingerprint}`))
      .map(u => u.row.refreshError)
      .filter((e): e is { message: string; at: string } => Boolean(e))
      .sort((a, b) => b.at.localeCompare(a.at))[0];

    const meta = {
      fingerprint: refreshing ? `refreshing:${fingerprint}` : fingerprint,
      refreshing,
      pending: pending.length ? { rows: needs.filter(need => !ready.has(need.key)).length, controls: pending, total: needs.length } : undefined,
      seriesPending: Boolean(query.timelineDays) && pending.length > 0,
      refreshError,
      computedAt: new Date(refreshing && used.length ? smallest(used.map(u => u.storedAt)) : ctx.now.getTime()).toISOString(),
      evaluatedAt: ctx.now.toISOString(),
      configurationUpdatedAt: ctx.configurationUpdatedAt,
      level: ctx.configuration.global.ensLevel,
      window: ctx.window,
      agentId: query.agentId,
      controlId: query.controlId,
      verdicts: ctx.activity.total,
      scope: ctx.scope.map(agent => ({ id: agent.id, name: agent.name, status: agent.status })),
      inventory: ctx.inventory,
      stats: { totalMs: Date.now() - started, computed: used.filter(u => u.computed).length, refreshingInBackground },
    };

    const rowName = (agentId: string) => ctx.scope.find(agent => agent.id === agentId)?.name;
    return { ctx, query, meta, state, views, timeline, rowName };
  };

  const idle = () => !inflight.size && !reads.running && !reads.queued;

  return { loadContext, run, viewFingerprint, rows, reads, idle };
};

export type ENSEvaluationService = ReturnType<typeof createEvaluationService>;
