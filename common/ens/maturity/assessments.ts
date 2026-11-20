import type { ENSConfigurationVersion } from '../configuration/types';
import { ENS_MATURITY_MAX, ENSMaturityAssessment, ENSMaturityScale } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLevel = (value: unknown): boolean =>
  value === undefined || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= ENS_MATURITY_MAX);

const MEASURE = /^[a-z]+(\.[a-z]+)?\.[0-9]+$/;

export const validateMaturityShape = (value: unknown, path: string = 'configuration.maturity'): string[] => {
  if (value === undefined) return [];
  if (!isRecord(value) || !Array.isArray(value.assessments)) return [`${path} must be an object with an assessments array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.assessments.forEach((entry, index) => {
    const at = `${path}.assessments[${index}]`;
    if (!isRecord(entry) || typeof entry.measureId !== 'string' || !MEASURE.test(entry.measureId)) {
      errors.push(`${at}.measureId must be an ENS measure such as op.acc.1 or org.2.`);
      return;
    }
    if (seen.has(entry.measureId)) errors.push(`${at}: ${entry.measureId} is assessed twice.`);
    seen.add(entry.measureId);
    if (!isLevel(entry.level)) errors.push(`${at}.level must be an integer from 0 to ${ENS_MATURITY_MAX}.`);
    if (!isLevel(entry.target)) errors.push(`${at}.target must be an integer from 0 to ${ENS_MATURITY_MAX}.`);
    ['references', 'note', 'assessedBy', 'assessedAt'].forEach(key => {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') errors.push(`${at}.${key} must be a string.`);
    });
  });
  return [...errors, ...validateScales(value.scales, `${path}.scales`)];
};

const isPercent = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;

const risingPercents = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === ENS_MATURITY_MAX &&
  value.every((threshold, index) => isPercent(threshold) && (index === 0 || threshold >= value[index - 1]));

const validateScales = (value: unknown, path: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${path} must be an array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry) || typeof entry.controlId !== 'string' || !MEASURE.test(entry.controlId)) {
      errors.push(`${at}.controlId must be an ENS measure such as mp.info.6.`);
      return;
    }
    if (entry.agentId !== undefined && (typeof entry.agentId !== 'string' || !entry.agentId.trim())) errors.push(`${at}.agentId must be a Wazuh agent id.`);
    const key = `${entry.controlId}|${entry.agentId || ''}`;
    if (seen.has(key)) errors.push(`${at}: ${entry.controlId}${entry.agentId ? ` on ${entry.agentId}` : ''} has two scales.`);
    seen.add(key);
    if (!risingPercents(entry.thresholds)) errors.push(`${at}.thresholds must be ${ENS_MATURITY_MAX} rising percents from 0 to 100, the minimum for L1 to L${ENS_MATURITY_MAX}.`);
  });
  return errors;
};

export const scalesOf = (configuration: Pick<ENSConfigurationVersion, 'maturity'>): ENSMaturityScale[] =>
  configuration.maturity?.scales || [];

export const assessmentsOf = (configuration: Pick<ENSConfigurationVersion, 'maturity'>): ENSMaturityAssessment[] =>
  configuration.maturity?.assessments || [];

export const assessmentOf = (
  configuration: Pick<ENSConfigurationVersion, 'maturity'>,
  measureId: string
): ENSMaturityAssessment | undefined => assessmentsOf(configuration).find(entry => entry.measureId === measureId);

const emptyAssessment = (entry: ENSMaturityAssessment): boolean =>
  entry.level === undefined && entry.target === undefined && !entry.references?.trim() && !entry.note?.trim();

export const setAssessment = (
  configuration: ENSConfigurationVersion,
  next: ENSMaturityAssessment
): ENSConfigurationVersion => {
  const others = assessmentsOf(configuration).filter(entry => entry.measureId !== next.measureId);
  const assessments = emptyAssessment(next) ? others : [...others, next].sort((a, b) => a.measureId.localeCompare(b.measureId));
  const scales = scalesOf(configuration);
  return { ...configuration, maturity: scales.length ? { assessments, scales } : { assessments } };
};

const sameContent = (a: ENSMaturityAssessment, b?: ENSMaturityAssessment): boolean =>
  !!b && a.level === b.level && a.target === b.target && (a.references || '') === (b.references || '') && (a.note || '') === (b.note || '');

// The server signs every assessment whose content changed: a browser cannot claim another author.
export const stampAssessments = (
  next: ENSMaturityAssessment[],
  previous: ENSMaturityAssessment[],
  user: string,
  now: string
): ENSMaturityAssessment[] =>
  next.map(entry => {
    const before = previous.find(item => item.measureId === entry.measureId);
    return sameContent(entry, before)
      ? { ...entry, assessedBy: before!.assessedBy, assessedAt: before!.assessedAt }
      : { ...entry, assessedBy: user, assessedAt: now };
  });

const sameScaleTarget = (a: ENSMaturityScale, b: ENSMaturityScale): boolean =>
  a.controlId === b.controlId && (a.agentId || '') === (b.agentId || '');

const withScales = (configuration: ENSConfigurationVersion, scales: ENSMaturityScale[]): ENSConfigurationVersion => ({
  ...configuration,
  maturity: { assessments: assessmentsOf(configuration), ...(scales.length ? { scales } : {}) },
});

export const setScale = (configuration: ENSConfigurationVersion, next: ENSMaturityScale, replaced?: ENSMaturityScale): ENSConfigurationVersion => {
  const clean: ENSMaturityScale = {
    controlId: next.controlId,
    ...(next.agentId?.trim() ? { agentId: next.agentId.trim() } : {}),
    thresholds: next.thresholds,
  };
  const others = scalesOf(configuration).filter(s => !sameScaleTarget(s, clean) && !(replaced && sameScaleTarget(s, replaced)));
  const scales = [...others, clean].sort((a, b) => a.controlId.localeCompare(b.controlId) || (a.agentId || '').localeCompare(b.agentId || ''));
  return withScales(configuration, scales);
};

export const removeScale = (configuration: ENSConfigurationVersion, removed: ENSMaturityScale): ENSConfigurationVersion =>
  withScales(configuration, scalesOf(configuration).filter(s => !sameScaleTarget(s, removed)));

export const thresholdsProblem = (thresholds: number[]): string | undefined =>
  risingPercents(thresholds) ? undefined : `${ENS_MATURITY_MAX} porcentajes de 0 a 100 en orden creciente`;
