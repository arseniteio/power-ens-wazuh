import { ENSControlDefinition, ENSLevelDimension } from '../catalog/types';
import { ENSGlobalConfiguration, ENSLevel } from '../configuration/types';

type ENSDimensionLevelKey =
  | 'confidentialityLevel'
  | 'integrityLevel'
  | 'traceabilityLevel'
  | 'authenticityLevel'
  | 'availabilityLevel';

export const ENS_DIMENSIONS: ENSLevelDimension[] = ['C', 'I', 'T', 'A', 'D'];

export const ENS_DIMENSION_LEVEL_KEYS: Record<ENSLevelDimension, ENSDimensionLevelKey> = {
  C: 'confidentialityLevel',
  I: 'integrityLevel',
  T: 'traceabilityLevel',
  A: 'authenticityLevel',
  D: 'availabilityLevel',
};

export const ENS_DIMENSION_NAMES: Record<ENSLevelDimension, string> = {
  C: 'Confidencialidad',
  I: 'Integridad',
  T: 'Trazabilidad',
  A: 'Autenticidad',
  D: 'Disponibilidad',
};

const LEVEL_RANK: Record<ENSLevel, number> = { BAJO: 1, MEDIO: 2, ALTO: 3 };

// The configuration keeps BAJO for rank 1 in both places; only the system category is named BÁSICO.
export const ENS_CATEGORY_LABELS: Record<ENSLevel, string> = { BAJO: 'BÁSICO', MEDIO: 'MEDIO', ALTO: 'ALTO' };

export const categoryLabel = (level?: string): string =>
  (level && ENS_CATEGORY_LABELS[level as ENSLevel]) || level || '';

const isENSLevel = (value: unknown): value is ENSLevel =>
  typeof value === 'string' && value in LEVEL_RANK;

const compareENSLevels = (a: ENSLevel, b: ENSLevel): number => LEVEL_RANK[a] - LEVEL_RANK[b];

export const listControlDimensions = (
  control: Pick<ENSControlDefinition, 'levelDimension'>
): ENSLevelDimension[] => {
  const declared = control.levelDimension;

  if (declared === undefined) {
    return [];
  }

  return Array.isArray(declared) ? declared : [declared];
};

const resolveDimensionLevel = (
  dimension: ENSLevelDimension,
  level: ENSLevel,
  global?: Partial<ENSGlobalConfiguration>
): ENSLevel => {
  const declared = global?.[ENS_DIMENSION_LEVEL_KEYS[dimension]];

  return isENSLevel(declared) ? declared : level;
};

export const resolveControlLevel = (
  control: Pick<ENSControlDefinition, 'levelDimension'>,
  level: ENSLevel,
  global?: Partial<ENSGlobalConfiguration>
): ENSLevel =>
  listControlDimensions(control)
    .map(dimension => resolveDimensionLevel(dimension, level, global))
    .reduce<ENSLevel | undefined>(
      (highest, current) => (highest === undefined || compareENSLevels(current, highest) > 0 ? current : highest),
      undefined
    ) || level;

export const findDimensionsAboveENSLevel = (
  global?: Partial<ENSGlobalConfiguration>
): ENSLevelDimension[] => {
  if (!global || !isENSLevel(global.ensLevel)) {
    return [];
  }

  const ensLevel = global.ensLevel;

  return ENS_DIMENSIONS.filter(dimension => {
    const declared = global[ENS_DIMENSION_LEVEL_KEYS[dimension]];

    return isENSLevel(declared) && compareENSLevels(declared, ensLevel) > 0;
  });
};

export const describeDimensionsAboveENSLevel = (
  global?: Partial<ENSGlobalConfiguration>
): string | undefined => {
  const above = findDimensionsAboveENSLevel(global);

  if (!above.length || !global) {
    return undefined;
  }

  const list = above
    .map(dimension => `${ENS_DIMENSION_NAMES[dimension]} (${dimension}) ${global[ENS_DIMENSION_LEVEL_KEYS[dimension]]}`)
    .join(', ');

  return `Categoría del sistema ${categoryLabel(global.ensLevel)} inferior a: ${list}.`;
};

export const describeControlAxis = (
  control: Pick<ENSControlDefinition, 'levelDimension'>
): string => {
  const dimensions = listControlDimensions(control);

  if (!dimensions.length) {
    return 'Se aplica por la categoría del sistema';
  }

  return dimensions.length === 1
    ? `Se aplica por el nivel de ${ENS_DIMENSION_NAMES[dimensions[0]]} (${dimensions[0]})`
    : `Se aplica por el nivel más alto de ${dimensions.join('·')}`;
};

export const describeLevelSource = (
  control: Pick<ENSControlDefinition, 'levelDimension'>
): string | undefined => {
  const dimensions = listControlDimensions(control);

  if (!dimensions.length) {
    return undefined;
  }

  return dimensions.length === 1 ? ENS_DIMENSION_NAMES[dimensions[0]] : `el más alto de ${dimensions.join('·')}`;
};

export const describeApplicableLevelLabel = (control: Pick<ENSControlDefinition, 'levelDimension'>): string => {
  const source = describeLevelSource(control);

  return source ? `Nivel aplicable (${source})` : 'Categoría del sistema';
};
