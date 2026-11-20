import type { ENSLevel } from '../types';

export interface ENSLevelAdjustment {
  controlId: string;
  agentId?: string;
  level: ENSLevel;
  reason: string;
}

const RANK: Record<ENSLevel, number> = { BAJO: 1, MEDIO: 2, ALTO: 3 };
const CONTROL = /^[a-z]+(\.[a-z]+)?\.[0-9]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLevel = (value: unknown): value is ENSLevel => typeof value === 'string' && value in RANK;

export const validateLevelAdjustmentsShape = (value: unknown, path = 'configuration.levelAdjustments'): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${path} must be an array.`];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry) || typeof entry.controlId !== 'string' || !CONTROL.test(entry.controlId)) {
      errors.push(`${at}.controlId must be an ENS control such as op.acc.1.`);
      return;
    }
    if (entry.agentId !== undefined && (typeof entry.agentId !== 'string' || !entry.agentId.trim())) errors.push(`${at}.agentId must be a Wazuh agent id.`);
    if (!isLevel(entry.level)) errors.push(`${at}.level must be BAJO, MEDIO or ALTO.`);
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) errors.push(`${at}.reason is required.`);
    const key = `${entry.controlId}|${entry.agentId || ''}`;
    if (seen.has(key)) errors.push(`${at}: ${entry.controlId}${entry.agentId ? ` on ${entry.agentId}` : ''} is adjusted twice.`);
    seen.add(key);
  });
  return errors;
};

// Mirrors the engine: only a lower level than the one in force applies, a machine adjustment
// wins over the control one, and an adjustment without a reason is ignored.
export const adjustedLevel = (
  controlId: string,
  agentId: string | undefined,
  level: ENSLevel,
  adjustments: ENSLevelAdjustment[] = []
): { level: ENSLevel; adjustment?: ENSLevelAdjustment } => {
  const usable = adjustments.filter(
    a => a.controlId === controlId && isLevel(a.level) && a.reason?.trim() && RANK[a.level] <= RANK[level]
  );
  const adjustment = usable.find(a => agentId && a.agentId === agentId) || usable.find(a => !a.agentId);
  return adjustment ? { level: adjustment.level, adjustment } : { level };
};

type WithAdjustments = { levelAdjustments?: ENSLevelAdjustment[] };

const sameTarget = (a: Pick<ENSLevelAdjustment, 'controlId' | 'agentId'>, b: Pick<ENSLevelAdjustment, 'controlId' | 'agentId'>): boolean =>
  a.controlId === b.controlId && (a.agentId || '') === (b.agentId || '');

const byTarget = (a: ENSLevelAdjustment, b: ENSLevelAdjustment): number =>
  a.controlId.localeCompare(b.controlId) || (a.agentId || '').localeCompare(b.agentId || '');

export const setLevelAdjustment = <T extends WithAdjustments>(configuration: T, next: ENSLevelAdjustment, replaced?: ENSLevelAdjustment): T => {
  const clean: ENSLevelAdjustment = {
    controlId: next.controlId,
    ...(next.agentId?.trim() ? { agentId: next.agentId.trim() } : {}),
    level: next.level,
    reason: next.reason.trim(),
  };
  const others = (configuration.levelAdjustments || []).filter(a => !sameTarget(a, clean) && !(replaced && sameTarget(a, replaced)));
  return { ...configuration, levelAdjustments: [...others, clean].sort(byTarget) };
};

export const removeLevelAdjustment = <T extends WithAdjustments>(configuration: T, removed: ENSLevelAdjustment): T => ({
  ...configuration,
  levelAdjustments: (configuration.levelAdjustments || []).filter(a => !sameTarget(a, removed)),
});
