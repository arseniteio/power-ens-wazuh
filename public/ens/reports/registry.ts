import { ENGINE_CATALOG } from '../../../common/ens/catalog/engine-catalog';
import { valuesText } from '../../../common/ens/configuration/table-rows';
import { statusLabel } from '../../../common/ens/core/status-label';
import type { ENSComplianceResult, ENSEvidenceResult } from '../../../common/ens/core/evaluation/types';

export type ENSReportFieldStatus = 'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE' | 'NO_EVALUABLE' | 'NO_APLICA' | 'SIN_DATOS';

export interface ENSReportField {
  id: string;
  title: string;
  status: ENSReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface ENSReportModel {
  controlId: string;
  status: ENSReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: ENSReportField[];
}

export interface ENSReportModelDefinition {
  controlId: string;
  name: string;
  build: (result: ENSComplianceResult | undefined) => ENSReportModel;
}

interface CatalogReportField {
  id: string;
  title: string;
  description: string;
  evidences: string[];
  parameters: string[];
}

const SEVERITY: ENSReportFieldStatus[] = ['NO_CUMPLE', 'PARCIAL', 'NO_EVALUABLE', 'CUMPLE', 'NO_APLICA'];

const asStatus = (status?: string): ENSReportFieldStatus =>
  SEVERITY.includes(status as ENSReportFieldStatus) ? (status as ENSReportFieldStatus) : 'SIN_DATOS';

const worstOf = (statuses: ENSReportFieldStatus[]): ENSReportFieldStatus =>
  statuses.length ? SEVERITY.find(status => statuses.includes(status)) || 'SIN_DATOS' : 'SIN_DATOS';

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.length ? valuesText(value) : 'Sin valor';
  if (value === undefined || value === null || value === '') return 'Sin valor';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
};

const isSet = (value: unknown): boolean => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '');

const buildReportModel = (entry: any, result: ENSComplianceResult | undefined): ENSReportModel => {
  const evidences = new Map<string, ENSEvidenceResult>((result?.evidences || []).map(evidence => [evidence.id, evidence]));
  const parameters = new Map((result?.parameters || []).map(parameter => [parameter.id, parameter]));
  const score = result && typeof result.score === 'number' ? result.score : null;

  const status: ENSReportField = {
    id: `${entry.control}.estado`,
    title: 'Estado del control',
    status: asStatus(result?.status),
    value: result ? `${statusLabel(result.status)}${score !== null ? ` · ${score} %` : ''}` : 'Sin datos',
    evidenceIds: [],
    details: result?.observations || [],
    producerGaps: [],
  };

  const fields = (entry.report as CatalogReportField[]).map(field => ({
    id: `${entry.control}.${field.id}`,
    title: field.title,
    status: worstOf(field.evidences.map(id => asStatus(evidences.get(id)?.status))),
    value: field.description,
    evidenceIds: field.evidences,
    details: [
      ...field.evidences.map(id => `${id}: ${evidences.get(id)?.observations?.[0] || 'sin veredicto'}`),
      ...field.parameters.map(id => `${[id, parameters.get(id)?.label].filter(Boolean).join(' ')}: ${formatValue(parameters.get(id)?.value)}`),
    ],
    producerGaps: field.parameters.filter(id => !isSet(parameters.get(id)?.value)),
  }));

  return {
    controlId: entry.control,
    status: asStatus(result?.status),
    score,
    coverage: result ? result.coverage : null,
    level: result?.level || '',
    evaluatedAt: result?.evaluatedAt,
    fields: [status, ...fields],
  };
};

const definitions = new Map<string, ENSReportModelDefinition>(
  ENGINE_CATALOG.map(entry => [
    entry.control,
    { controlId: entry.control, name: `${entry.control} - ${entry.title}`, build: (result: ENSComplianceResult | undefined) => buildReportModel(entry, result) },
  ])
);

export const getENSReportModelDefinition = (controlId: string): ENSReportModelDefinition | undefined => definitions.get((controlId || '').trim());

export const listENSControlsWithoutReportModel = (controlIds: string[]): string[] =>
  controlIds.filter(controlId => !definitions.has((controlId || '').trim()));
