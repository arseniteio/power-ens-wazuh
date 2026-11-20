import type { ENSTally } from '../core/tally';

export const ENS_MATURITY_MAX = 5;
export const ENS_MATURITY_MAX_ACCREDITED = 2;

// The engine's scale until the configuration sets one: minimum percentage for L1 to L5.
export const ENS_DEFAULT_SCALE = [20, 40, 60, 80, 100];

export const ENS_MATURITY_LABELS: Record<number, string> = {
  0: 'Inexistente',
  1: 'Inicial',
  2: 'Reproducible pero intuitivo',
  3: 'Proceso definido',
  4: 'Gestionado y medible',
  5: 'Optimizado',
};

export const ENS_MATURITY_NOTE =
  'Acreditado: evidencia de Wazuh, L0 a L2. Valorado: declaración documentada, L0 a L5.';

export const incoherenceText = (assessed?: number, accredited?: number): string =>
  `Valorado L${assessed ?? '?'} · acreditado L${accredited ?? 0}: evidencia discontinua en los últimos 30 días`;

export const maturityLabel = (level?: number): string =>
  level === undefined || level === null ? '—' : `L${level} ${ENS_MATURITY_LABELS[level] || ''}`.trim();

export interface ENSMaturityAssessment {
  measureId: string;
  level?: number;
  target?: number;
  assessedBy?: string;
  assessedAt?: string;
  references?: string;
  note?: string;
}

export interface ENSMaturityScale {
  controlId: string;
  agentId?: string;
  thresholds: number[];
}

export interface ENSMaturityConfiguration {
  assessments: ENSMaturityAssessment[];
  scales?: ENSMaturityScale[];
}

export interface ENSEngineMaturity {
  accredited?: number;
  working_days?: number;
  period_days?: number;
  assessed?: number;
  target?: number;
  assessed_by?: string;
  assessed_at?: string;
  references?: string;
  note?: string;
  incoherent?: boolean;
  machines?: number;
  applicable?: number;
  unmeasured?: number;
  unassessed?: number;
  below_target?: string[];
  accredited_counts?: number[];
  assessed_counts?: number[];
  global_accredited?: number;
  global_assessed?: number;
  tally?: ENSTally;
}

export interface ENSOrganizationMaturity {
  at?: string;
  summary?: ENSEngineMaturity;
  measures: Record<string, ENSEngineMaturity>;
}
