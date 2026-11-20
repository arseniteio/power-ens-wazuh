import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import type {
  ENSControlSummaryEntry,
  ENSFreshness,
  ENSOverviewNonConformity,
} from '../../../common/ens/evaluation/types';
import type { ENSVerdictActivity } from './window';
import { guiltyPart, parseMotive } from '../../../common/ens/evaluation/motive-parser';

export const agentControlRows = (
  state: Pick<ENSComplianceState, 'agents'> | undefined,
  summaryOf: (controlId: string, result?: ENSComplianceResult) => ENSControlSummaryEntry
) =>
  (state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    controls: agent.results.map(result => summaryOf(result.control.id, result)),
  }));

export const freshnessOf = (activity: ENSVerdictActivity, meta: { evaluatedAt: string; scope: { id: string }[] }): ENSFreshness => ({
  checkedAt: meta.evaluatedAt,
  agents: meta.scope.map(agent => ({
    agentId: agent.id,
    count: activity.agents[agent.id]?.count || 0,
    earliest: activity.agents[agent.id]?.earliest,
    newest: activity.agents[agent.id]?.newest,
  })),
  cells: activity.cells,
});

export const nonConformitiesOf = (state: Pick<ENSComplianceState, 'results'> | undefined): ENSOverviewNonConformity[] =>
  (state?.results || []).flatMap(result =>
    (result.nonConformities || []).map(nc => {
      const culprit = guiltyPart(parseMotive(nc.finding).parts, nc.evidenceIds || []);
      return {
        controlId: result.control.id,
        id: nc.id,
        requirementId: nc.requirementId,
        ...(nc.requirementIds && nc.requirementIds.length > 1 ? { requirementIds: nc.requirementIds } : {}),
        origin: nc.origin,
        ...(nc.cause ? { cause: nc.cause } : {}),
        ...(nc.documental ? { documental: true } : {}),
        evidenceIds: nc.evidenceIds || [],
        agentIds: (nc.agents || []).map(agent => agent.agentId),
        title: culprit?.summary || nc.finding,
        ...(culprit?.evidenceId ? { titleEvidenceId: culprit.evidenceId, titleStatus: culprit.status } : {}),
      };
    })
  );

export const overviewQueryFlags = (query: Record<string, unknown>): { timelineControls?: true } =>
  query.timelineControls === true || query.timelineControls === 'true' ? { timelineControls: true } : {};

export const visibleTimeline = (timeline: any[] | undefined, query: { timelineControls?: boolean }): any[] | undefined =>
  timeline && !query.timelineControls ? timeline.map(({ controls, ...point }) => point) : timeline;

export const perControlOfPoint = (
  controls: string[],
  points: ({ status?: string; score?: number } | null | undefined)[]
): Record<string, { status?: string; score?: number }> =>
  Object.fromEntries(controls.flatMap((controlId, i) => (points[i] ? [[controlId, { status: points[i]!.status, score: points[i]!.score }]] : [])));

export const perControlOfResults = (results: Pick<ENSComplianceResult, 'control' | 'status' | 'score'>[]) =>
  Object.fromEntries(results.map(r => [r.control.id, { status: r.status, score: r.score }]));
