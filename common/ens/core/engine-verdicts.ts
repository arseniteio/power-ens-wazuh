import { ENSCatalog } from '../catalog';
import type { ENSControlDefinition, ENSRequirementDefinition } from '../catalog/types';
import type { ENSLevel } from '../configuration/types';
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../configuration/services/configuration-state-service';
import { validateControlConfiguration } from '../configuration/services/validation-engine';
import { resolveControlLevel } from './control-level';
import { renderEngineMessage } from '../catalog/engine-messages';
import { getEvidenceDefinitions } from './evidence/registry';
import type { ENSTally } from './tally';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSEvidenceResult,
  ENSGapCause,
  ENSNonConformity,
  ENSRequirementResult,
} from './evaluation/types';

export interface ENSEngineVerdict {
  '@timestamp': string;
  scope: 'evidence' | 'requirement' | 'control';
  control: string;
  requirement?: string;
  evidence?: string;
  agent: { id: string; name?: string };
  status: string;
  cause?: string;
  reason?: string;
  reason_code?: string;
  reason_args?: Record<string, unknown>;
  evidenced?: boolean;
  attested?: boolean;
  score?: number;
  coverage?: number;
  applicable_requirements?: number;
  measured_requirements?: number;
  unmeasured_requirements?: string[];
  tally?: ENSTally;
}

const STATUS: Record<string, ENSComplianceStatus> = {
  COMPLIANT: 'CUMPLE',
  NON_COMPLIANT: 'NO_CUMPLE',
  PARTIAL: 'PARCIAL',
  NOT_EVALUABLE: 'NO_EVALUABLE',
  NOT_APPLICABLE: 'NO_APLICA',
};

const reasonOf = (verdict?: ENSEngineVerdict): string | undefined =>
  verdict && (renderEngineMessage(verdict.reason_code, verdict.reason_args) ?? verdict.reason);

const statusOfVerdict = (status?: string): ENSComplianceStatus => (status && STATUS[status]) || 'NO_EVALUABLE';

const GAP_CAUSES: ENSGapCause[] = ['CATALOG', 'CONFIGURATION', 'COLLECTION', 'EVIDENCE'];

const causeOf = (verdict?: ENSEngineVerdict): ENSGapCause | undefined =>
  GAP_CAUSES.find(cause => cause === verdict?.cause);

const parameterIdsIn = (texts: (string | undefined)[]): string[] =>
  [...new Set(texts.flatMap(text => (text || '').match(/\bP-[0-9A-Z]+\b/g) || []))];

const noVerdict = 'Sin veredicto del motor para esta máquina.';

const requirementCause = (
  requirement: ENSRequirementDefinition,
  pending: ENSEngineVerdict[]
): ENSGapCause => {
  if (!requirement.evidenceIds.length) return 'CATALOG';
  const causes = pending.map(causeOf);
  if (!pending.length || causes.every(cause => cause === 'COLLECTION')) return 'COLLECTION';
  if (causes.includes('CONFIGURATION')) return 'CONFIGURATION';
  return 'EVIDENCE';
};

const ACTION_BY_CAUSE: Record<ENSGapCause, string> = {
  CATALOG: 'Declarar en el catálogo qué evidencias lo acreditan.',
  CONFIGURATION: 'Completar los parámetros en la pestaña Configuración.',
  COLLECTION: 'Comprobar que el agente está activo y envía hechos.',
  EVIDENCE: 'Revisar el colector de la evidencia.',
};

const isApplicable = (requirement: ENSRequirementDefinition, level: ENSLevel) =>
  requirement.applicability.levels.includes(level);

export const buildENSResultFromVerdicts = (
  controlId: string,
  globalLevel: ENSLevel,
  agentId: string | undefined,
  verdicts: ENSEngineVerdict[],
  now: Date
): ENSComplianceResult => {
  const control = ENSCatalog.find(entry => entry.id === controlId) as ENSControlDefinition;
  const level = resolveControlLevel(control, globalLevel, getActiveENSConfiguration()?.global);
  const configuration = getActiveControlConfiguration(controlId, agentId);
  const validation = configuration ? validateControlConfiguration(configuration, level) : undefined;

  const controlVerdict = verdicts.find(v => v.scope === 'control');
  const requirementVerdict = (id: string) => verdicts.find(v => v.scope === 'requirement' && v.requirement === id);
  const evidenceVerdict = (id: string) => verdicts.find(v => v.scope === 'evidence' && v.evidence === id);

  const evidences: ENSEvidenceResult[] = getEvidenceDefinitions(controlId).map(definition => {
    const verdict = evidenceVerdict(definition.id);
    return {
      id: definition.id,
      controlId,
      status: verdict ? statusOfVerdict(verdict.status) : 'NO_EVALUABLE',
      title: definition.title,
      description: definition.description,
      ...(verdict?.tally ? { tally: verdict.tally } : {}),
      observations: [reasonOf(verdict) || noVerdict],
      requirements: definition.requirements,
      levels: definition.levels,
      category: definition.category,
      criticality: definition.criticality,
      sourceTypes: definition.sourceTypes,
      expectedEventTypes: definition.expectedEventTypes,
      relatedRules: definition.relatedRules,
      auditQuestion: definition.auditQuestion,
      lastSeen: verdict?.['@timestamp'],
      agentId: verdict?.agent.id ?? agentId,
      agentName: verdict?.agent.name,
    };
  });

  const requirements = control.requirements.map(requirement => {
    const verdict = requirementVerdict(requirement.id);
    const applicable = verdict ? verdict.status !== 'NOT_APPLICABLE' : isApplicable(requirement, level);
    const status: ENSComplianceStatus = verdict ? statusOfVerdict(verdict.status) : applicable ? 'NO_CUMPLE' : 'NO_APLICA';
    return {
      id: requirement.id,
      title: requirement.title,
      level: requirement.applicability.levels,
      status,
      applicable,
      evidenced: verdict ? verdict.evidenced === true : false,
      ...(verdict?.attested ? { attested: true } : {}),
      score: status === 'CUMPLE' ? 100 : 0,
      observations: [reasonOf(verdict) || (applicable ? noVerdict : requirement.applicability.reason || `No aplica en nivel ${level}.`)],
      evidenceIds: requirement.evidenceIds,
    };
  });

  const nonConformities: ENSNonConformity[] = requirements
    .filter(requirement => requirement.applicable && requirement.status === 'NO_CUMPLE')
    .map((requirement, index) => {
      const definition = control.requirements.find(entry => entry.id === requirement.id) as ENSRequirementDefinition;
      const own = definition.evidenceIds.map(evidenceVerdict).filter((v): v is ENSEngineVerdict => Boolean(v));
      const id = `NC-${String(index + 1).padStart(3, '0')}`;

      if (requirement.evidenced) {
        const against = own.filter(v => v.status === 'NON_COMPLIANT' || v.status === 'PARTIAL');
        return {
          id,
          evidenceId: against[0]?.evidence || definition.evidenceIds[0] || 'ENS',
          requirementId: requirement.id,
          finding: against.map(v => `${v.evidence}: ${reasonOf(v)}`).join('; ') || requirement.observations[0],
          impact: `Impide cumplir ${controlId} en nivel ${level}.`,
          requiredAction: `Corregir en la máquina lo que señala ${against.map(v => v.evidence).join(', ') || requirement.id}.`,
          origin: 'MEDIDA' as const,
          evidenceIds: against.map(v => v.evidence as string),
          parameterIds: [],
        };
      }

      const pending = own.filter(v => v.status === 'NOT_EVALUABLE');
      const cause = requirementCause(definition, pending);
      return {
        id,
        evidenceId: pending[0]?.evidence || (cause === 'CONFIGURATION' ? 'CONFIG' : 'ENS'),
        requirementId: requirement.id,
        finding: pending.map(v => `${v.evidence}: ${reasonOf(v)}`).join('; ') || requirement.observations[0],
        impact: `Sin prueba no se puede dar por cumplido ${controlId} en nivel ${level}.`,
        requiredAction: ACTION_BY_CAUSE[cause],
        origin: 'NO_EVIDENCIADA' as const,
        cause,
        evidenceIds: pending.map(v => v.evidence as string),
        parameterIds: cause === 'CONFIGURATION' ? parameterIdsIn(pending.map(v => v.reason)) : [],
      };
    });

  const applicable = requirements.filter(requirement => requirement.applicable);
  const unmeasured = applicable.filter(requirement => !requirement.evidenced).map(requirement => requirement.id);
  const status: ENSComplianceStatus = controlVerdict
    ? statusOfVerdict(controlVerdict.status)
    : applicable.length
    ? 'NO_CUMPLE'
    : 'NO_APLICA';

  return {
    control: {
      id: control.id,
      name: control.name,
      family: control.family,
      category: control.category,
      description: control.description,
    },
    level,
    status,
    score: status === 'NO_APLICA' ? undefined : controlVerdict?.score ?? 0,
    coverage: controlVerdict?.coverage ?? 0,
    applicableRequirements: controlVerdict?.applicable_requirements ?? applicable.length,
    measuredRequirements: controlVerdict?.measured_requirements ?? applicable.length - unmeasured.length,
    unmeasuredRequirements: controlVerdict?.unmeasured_requirements ?? unmeasured,
    evaluatedAt: controlVerdict?.['@timestamp'] || now.toISOString(),
    lastEvidenceAt: evidences.map(evidence => evidence.lastSeen).filter(Boolean).sort().reverse()[0],
    requirements: requirements as ENSRequirementResult[],
    parameters: (validation?.parameters || []).map(parameter => ({
      id: parameter.id,
      name: parameter.name,
      label: parameter.label,
      status: parameter.status || 'NOT_CONFIGURED',
      value: parameter.value,
      required: parameter.required,
      requirements: parameter.requirements,
      ifNotConfigured: parameter.ifNotConfigured,
    })),
    evidences,
    missingParameters: parameterIdsIn(verdicts.filter(v => v.cause === 'CONFIGURATION').map(v => v.reason)),
    missingEvidences: evidences.filter(evidence => evidence.status === 'NO_EVALUABLE').map(evidence => evidence.id),
    relatedRules: [...new Set(evidences.flatMap(evidence => evidence.relatedRules))],
    nonConformities,
    observations: [reasonOf(controlVerdict) || noVerdict],
    traceability: [
      { source: 'CATALOG', reference: controlId, description: 'Definición del control ENS.', controlId },
      ...verdicts
        .filter(v => v.scope === 'evidence')
        .map(v => ({
          source: 'EVIDENCE' as const,
          reference: v.evidence as string,
          description: reasonOf(v) || '',
          controlId,
          evidenceId: v.evidence,
          status: statusOfVerdict(v.status),
          agentId: v.agent.id,
          agentName: v.agent.name,
          timestamp: v['@timestamp'],
        })),
    ],
  };
};

export const verdictSeriesPoints = (
  cutoffs: Date[],
  daily: ENSEngineVerdict[]
): Record<string, { status: ENSComplianceStatus; score?: number }> => {
  const ascending = daily
    .map(v => ({ v, time: Date.parse(v['@timestamp']) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  return Object.fromEntries(
    cutoffs.flatMap(cutoff => {
      const end = cutoff.getTime();
      const last = ascending.filter(item => item.time <= end && item.time > end - 86400e3).pop()?.v;
      return last ? [[cutoff.toISOString(), { status: statusOfVerdict(last.status), score: last.score }]] : [];
    })
  );
};
