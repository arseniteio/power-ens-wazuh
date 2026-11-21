import { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { catalogControlIds } from './window';
import type { ENSEvaluationService } from './evaluation-service';
import { agentControlRows, freshnessOf, nonConformitiesOf, visibleTimeline } from './overview-fields';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

const controlSummaryOf = (controlId: string, result?: ENSComplianceResult) => {
  const requirements = (result?.requirements || []).filter(requirement => (requirement as { applicable?: boolean }).applicable);
  return {
    controlId,
    status: result?.status || 'NO_EVALUABLE',
    score: result?.score,
    ...(result?.compliance ? { compliance: result.compliance } : {}),
    evaluated: Boolean(result),
    requirementsNotMet: requirements.filter(requirement => requirement.status !== 'CUMPLE').length,
    requirementsNotEvidenced: requirements.filter(
      requirement => requirement.status !== 'CUMPLE' && (requirement as { evidenced?: boolean }).evidenced === false
    ).length,
  };
};

const agentRows = (run: RunOutput) =>
  (run.state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    results: agent.results.map(result => ({ controlId: result.control.id, status: result.status, score: result.score })),
  }));

const WORST_MACHINES = 5;

const worstMachines = (run: RunOutput) =>
  (run.state?.agents || [])
    .filter(agent => agent.summary.measured > 0)
    .map(agent => ({
      agentId: agent.agentId,
      agentName: agent.agentName || run.meta.scope.find(machine => machine.id === agent.agentId)?.name,
      score: agent.summary.scoreAverage,
      nonCompliant: agent.summary.nonCompliant,
      partial: agent.summary.partial,
    }))
    .sort((a, b) => a.score - b.score || b.nonCompliant - a.nonCompliant)
    .slice(0, WORST_MACHINES);

const stateHeader = (run: RunOutput) => {
  const state = run.state!;
  return {
    controlSummary: state.controlSummary,
    requirementSummary: state.requirementSummary,
    agentSummary: state.agentSummary,
    evidenceSummary: state.evidenceSummary,
  };
};

export const buildEvaluationResponse = (run: RunOutput) => {
  const { query, state, views, meta } = run;
  const timeline = visibleTimeline(run.timeline, query);

  if (query.include === 'control' && query.controlId) {
    const entry = views.get(query.controlId);
    return {
      meta,
      result: entry?.result
        ? { ...entry.result, traceability: entry.traceability().slice(0, ENS_EVALUATION_LIMITS.traceabilityInitial) }
        : undefined,
      traceabilityTotal: entry?.traceabilityTotal || 0,
      traceabilityAvailable: entry?.traceabilityStored || 0,
      agents: (entry?.rows || []).map(row => ({
        agentId: row.agentId,
        agentName: run.rowName(row.agentId) || meta.scope.find(agent => agent.id === row.agentId)?.name,
        status: row.result.status,
        score: row.result.score,
      })),
      timeline,
    };
  }

  if (!state) {
    return { meta };
  }

  const pendings = meta.pending?.controls || [];
  const withPending = <T extends { controlId: string }>(readyOnes: T[], pending: (controlId: string) => T): T[] => {
    if (!pendings.length) return readyOnes;
    const byIdMap = new Map(readyOnes.map(entry => [entry.controlId, entry]));
    return catalogControlIds()
      .filter(id => byIdMap.has(id) || pendings.includes(id))
      .map(id => byIdMap.get(id) || pending(id));
  };

  if (query.include === 'summary' || query.include === 'overview') {
    const summary = {
      meta,
      ...stateHeader(run),
      controls: withPending(
        state.results.map(result => controlSummaryOf(result.control.id, result)),
        controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
      ),
      agents: agentControlRows(run.state, controlSummaryOf),
      ...(timeline ? { timeline } : {}),
    };
    return query.include === 'overview'
      ? { ...summary, freshness: freshnessOf(run.ctx.activity, run.meta), nonConformities: nonConformitiesOf(run.state) }
      : summary;
  }

  if (query.include === 'dashboard') {
    const model = buildENSDashboardModel(state, (timeline || []).map(point => ({ ...point, date: new Date(point.date) })));
    return {
      meta,
      ...stateHeader(run),
      dashboard: model,
      machines: worstMachines(run),
      timeline,
      controls: withPending(
        state.results.map(result => controlSummaryOf(result.control.id, result)),
        controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
      ),
    };
  }

  return {
    meta,
    ...stateHeader(run),
    results: state.results,
    agents: agentRows(run),
    timeline,
  };
};

export const buildTraceabilityPage = (run: RunOutput, from: number, size: number) => {
  const entry = run.query.controlId ? run.views.get(run.query.controlId) : undefined;
  const list = entry ? entry.traceability() : [];
  return {
    meta: run.meta,
    total: entry?.traceabilityTotal || 0,
    available: list.length,
    from,
    items: list.slice(from, from + size),
  };
};
