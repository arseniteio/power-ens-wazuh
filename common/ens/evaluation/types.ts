import type { ENSComplianceResult, ENSNonConformity } from '../core/evaluation/types';
import type { ENSComplianceSummary } from '../core/compliance-state/types';

export interface ENSEvaluationMeta {
  fingerprint: string;
  refreshing: boolean;
  pending?: { rows: number; controls: string[]; total: number };
  seriesPending?: boolean;
  refreshError?: { message: string; at: string };
  computedAt: string;
  evaluatedAt: string;
  configurationUpdatedAt?: string;
  level: string;
  window: { from: string; to: string };
  agentId?: string;
  controlId?: string;
  verdicts: { count: number; newest?: string };
  scope: { id: string; name?: string; status?: string }[];
  inventory: { stale: boolean; newestTimestamp?: string; agents: number };
}

export interface ENSEvaluationTimelinePoint {
  date: string;
  label: string;
  isCurrent: boolean;
  events: number;
  score?: number;
  status?: string;
  controls?: Record<string, { status?: string; score?: number }>;
}

export interface ENSControlSummaryEntry {
  controlId: string;
  status: string;
  score?: number;
  evaluated: boolean;
  pending?: boolean;
  requirementsNotMet: number;
  requirementsNotEvidenced: number;
}

export interface ENSMachineScore {
  agentId: string;
  agentName?: string;
  score: number;
  nonCompliant: number;
  partial: number;
}

export interface ENSControlEvaluationResponse {
  meta: ENSEvaluationMeta;
  result?: ENSComplianceResult;
  traceabilityTotal: number;
  traceabilityAvailable: number;
  agents: { agentId: string; agentName?: string; status: string; score?: number }[];
  timeline?: ENSEvaluationTimelinePoint[];
}

export interface ENSAgentControlsRow {
  agentId: string;
  agentName?: string;
  summary?: ENSComplianceSummary;
  controls: ENSControlSummaryEntry[];
}

export interface ENSSummaryEvaluationResponse {
  meta: ENSEvaluationMeta;
  controlSummary: ENSComplianceSummary;
  controls: ENSControlSummaryEntry[];
  agents?: ENSAgentControlsRow[];
  timeline?: ENSEvaluationTimelinePoint[];
}

export interface ENSFreshnessAgent {
  agentId: string;
  count: number;
  earliest?: string;
  newest?: string;
}

export interface ENSFreshnessCell {
  controlId: string;
  agentId: string;
  count: number;
  newest?: string;
}

export interface ENSFreshness {
  checkedAt: string;
  agents: ENSFreshnessAgent[];
  cells: ENSFreshnessCell[];
}

export type ENSOverviewNonConformity = Pick<ENSNonConformity, 'id' | 'requirementId' | 'requirementIds' | 'origin' | 'cause' | 'documental' | 'evidenceIds'> & {
  controlId: string;
  agentIds: string[];
  title: string;
  titleEvidenceId?: string;
  titleStatus?: string;
};

export interface ENSOverviewEvaluationResponse extends ENSSummaryEvaluationResponse {
  freshness: ENSFreshness;
  nonConformities: ENSOverviewNonConformity[];
}

export interface ENSTraceabilityPageResponse {
  meta: ENSEvaluationMeta;
  total: number;
  available: number;
  from: number;
  items: ENSComplianceResult['traceability'];
}
