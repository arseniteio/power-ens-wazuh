import table from '../catalog/maturity.json';
import type { ENSLevel } from '../configuration/types';
import type { ENSComplianceStatus } from '../core/evaluation/types';

// Same rule as engine/internal/maturity.Judge, driven by the same catalog table and tested against
// its shared cases: the plugin applies it to the selections the engine cannot precompute, such
// as a group of machines.

export interface ENSCompliance {
  percent: number;
  level: number;
  required: number;
  category: string;
  status: ENSComplianceStatus;
}

export interface ENSMaturityLevelDefinition {
  level: number;
  name: string;
  percent: number;
  meaning: string;
}

export const MATURITY_LEVELS: ENSMaturityLevelDefinition[] = table.levels;

export const CCN_SCALE: number[] = table.levels.slice(1).map(level => level.percent);

const REQUIRED: Record<string, number> = table.required;

const CATEGORY_LABELS: Record<string, string> = { BAJO: 'BÁSICO', MEDIO: 'MEDIO', ALTO: 'ALTO' };

export const requiredLevel = (level: ENSLevel | string): number | undefined => REQUIRED[level];

export const levelOf = (percent: number, thresholds: number[] = CCN_SCALE): number =>
  thresholds.reduce((level, threshold, index) => (percent >= threshold ? index + 1 : level), 0);

export const judgeCompliance = (percent: number, level: ENSLevel | string, thresholds: number[] = CCN_SCALE): ENSCompliance | undefined => {
  const required = requiredLevel(level);
  if (required === undefined || !Number.isFinite(percent)) return undefined;
  const reached = levelOf(percent, thresholds);
  const status: ENSComplianceStatus = percent <= 0 ? 'NO_CUMPLE' : reached >= required ? 'CUMPLE' : 'PARCIAL';
  return { percent, level: reached, required, category: CATEGORY_LABELS[level] || String(level), status };
};

export const maturityLevelName = (level: number): string => MATURITY_LEVELS.find(entry => entry.level === level)?.name || '';

export const maturityLevelMeaning = (level: number): string => MATURITY_LEVELS.find(entry => entry.level === level)?.meaning || '';
