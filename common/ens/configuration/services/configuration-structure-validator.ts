import {
  ENSConfigurationLifecycleStatus,
  ENSConfigurationScopeMode,
  ENSConfigurationVersion,
  ENSLevel,
  ENSParameterColumnType,
  ENSParameterStatus,
  ENSParameterType,
} from '../types';
import { ENS_DIMENSION_LEVEL_KEYS } from '../../core/control-level';
import {
  ENS_MATCH_MODES,
  validateAgentsConfigurationShape,
  validateCustomTemplatesShape,
} from '../../../agent-configuration';
import { validateOrganizationDataShape } from '../organization/organization-data-shape';
import { validateMaturityShape } from '../../maturity/assessments';
import { validateLevelAdjustmentsShape } from '../levels/level-adjustments';

type UnknownRecord = Record<string, unknown>;

interface ENSConfigurationStructureValidation {
  valid: boolean;
  errors: string[];
}

const ENS_LEVELS: ENSLevel[] = [
  'BAJO',
  'MEDIO',
  'ALTO',
];

const LIFECYCLE_STATUSES: ENSConfigurationLifecycleStatus[] = [
  'DRAFT',
  'CONFIGURED',
  'INCOMPLETE',
  'INVALID',
  'ACTIVE',
  'ARCHIVED',
];

const SCOPE_MODES: ENSConfigurationScopeMode[] = [
  'global',
  'agent',
  'group',
];

const PARAMETER_TYPES: ENSParameterType[] = [
  'string',
  'number',
  'boolean',
  'select',
  'list',
  'path',
  'url',
  'duration_hours',
  'duration_days',
  'table',
];

const PARAMETER_COLUMN_TYPES: ENSParameterColumnType[] = [
  'string',
  'identifier',
  'path',
  'octal',
  'number',
  'date',
  'select',
  'multiselect',
];

const PARAMETER_STATUSES: ENSParameterStatus[] = [
  'CONFIGURED',
  'NOT_CONFIGURED',
  'NOT_APPLICABLE',
  'INVALID',
];

const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'VALIDATED',
  'RESET',
];

const isRecord = (
  value: unknown
): value is UnknownRecord =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const isString = (
  value: unknown
): value is string =>
  typeof value === 'string';

const isStringArray = (
  value: unknown
): value is string[] =>
  Array.isArray(value) &&
  value.every(isString);

const isFiniteNumber = (
  value: unknown
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value);

const isAllowedString = <T extends string>(
  value: unknown,
  allowedValues: T[]
): value is T =>
  typeof value === 'string' &&
  allowedValues.includes(value as T);

const isParameterValue = (
  value: unknown
): boolean =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  isStringArray(value);

const validateRequiredStrings = (
  value: UnknownRecord,
  fields: string[],
  path: string,
  errors: string[]
): void => {
  fields.forEach(field => {
    if (!isString(value[field])) {
      errors.push(`${path}.${field} must be a string.`);
    }
  });
};

const validateParameterColumns = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path}.columns must be an array.`);
    return;
  }

  value.forEach((column, index) => {
    const columnPath = `${path}.columns[${index}]`;

    if (!isRecord(column)) {
      errors.push(`${columnPath} must be an object.`);
      return;
    }

    validateRequiredStrings(
      column,
      ['name', 'label'],
      columnPath,
      errors
    );

    if (
      !isAllowedString(
        column.type,
        PARAMETER_COLUMN_TYPES
      )
    ) {
      errors.push(`${columnPath}.type is invalid.`);
    }

    if (typeof column.required !== 'boolean') {
      errors.push(`${columnPath}.required must be a boolean.`);
    }

    if (
      column.options !== undefined &&
      !isStringArray(column.options)
    ) {
      errors.push(`${columnPath}.options must be a string array.`);
    }
  });
};

const validateParameter = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  validateRequiredStrings(
    value,
    [
      'id',
      'controlId',
      'name',
      'label',
      'description',
      'wazuhUsage',
      'powerEnsUsage',
      'ifNotConfigured',
    ],
    path,
    errors
  );

  if (
    value.example !== undefined &&
    !isString(value.example)
  ) {
    errors.push(`${path}.example must be a string.`);
  }

  if (
    value.options !== undefined &&
    !isStringArray(value.options)
  ) {
    errors.push(`${path}.options must be a string array.`);
  }

  if (value.optionsByLevel !== undefined) {
    const byLevel = value.optionsByLevel;
    const all = isStringArray(value.options) ? value.options : [];
    if (!isRecord(byLevel)) {
      errors.push(`${path}.optionsByLevel must be an object.`);
    } else {
      Object.entries(byLevel).forEach(([level, options]) => {
        if (!['BAJO', 'MEDIO', 'ALTO'].includes(level)) {
          errors.push(`${path}.optionsByLevel.${level} is not a level.`);
        } else if (!isStringArray(options) || options.some(option => !all.includes(option))) {
          errors.push(`${path}.optionsByLevel.${level} must list options of \`options\`.`);
        }
      });
    }
  }

  validateParameterColumns(
    value.columns,
    path,
    errors
  );

  if (
    !Array.isArray(value.levels) ||
    !value.levels.every(level =>
      isAllowedString(level, ENS_LEVELS)
    )
  ) {
    errors.push(`${path}.levels contains an invalid ENS level.`);
  }

  if (!isStringArray(value.requirements)) {
    errors.push(`${path}.requirements must be a string array.`);
  }

  if (!isAllowedString(value.type, PARAMETER_TYPES)) {
    errors.push(`${path}.type is invalid.`);
  }

  if (typeof value.required !== 'boolean') {
    errors.push(`${path}.required must be a boolean.`);
  }

  if (value.matchMode !== undefined && !isAllowedString(value.matchMode, ENS_MATCH_MODES)) {
    errors.push(`${path}.matchMode is invalid.`);
  }

  if (
    value.minValue !== undefined &&
    !isFiniteNumber(value.minValue)
  ) {
    errors.push(`${path}.minValue must be a finite number.`);
  }

  if (
    value.maxValue !== undefined &&
    !isFiniteNumber(value.maxValue)
  ) {
    errors.push(`${path}.maxValue must be a finite number.`);
  }

  if (
    isFiniteNumber(value.minValue) &&
    isFiniteNumber(value.maxValue) &&
    value.minValue > value.maxValue
  ) {
    errors.push(`${path}.minValue cannot be greater than maxValue.`);
  }

  if (!isParameterValue(value.defaultValue)) {
    errors.push(`${path}.defaultValue has an invalid value.`);
  }

  if (!isParameterValue(value.value)) {
    errors.push(`${path}.value has an invalid value.`);
  }

  if (!isStringArray(value.evidenceIds)) {
    errors.push(`${path}.evidenceIds must be a string array.`);
  }

  if (!isStringArray(value.ruleIds)) {
    errors.push(`${path}.ruleIds must be a string array.`);
  }

  if (
    value.status !== undefined &&
    !isAllowedString(value.status, PARAMETER_STATUSES)
  ) {
    errors.push(`${path}.status is invalid.`);
  }
};

const validateControl = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  validateRequiredStrings(
    value,
    [
      'controlId',
      'controlName',
      'family',
    ],
    path,
    errors
  );

  if (typeof value.enabled !== 'boolean') {
    errors.push(`${path}.enabled must be a boolean.`);
  }

  if (
    !Array.isArray(value.applicableLevels) ||
    !value.applicableLevels.every(level =>
      isAllowedString(level, ENS_LEVELS)
    )
  ) {
    errors.push(
      `${path}.applicableLevels contains an invalid ENS level.`,
    );
  }

  if (!Array.isArray(value.parameters)) {
    errors.push(`${path}.parameters must be an array.`);
    return;
  }

  value.parameters.forEach((parameter, index) => {
    validateParameter(
      parameter,
      `${path}.parameters[${index}]`,
      errors
    );
  });
};

const validateGlobalConfiguration = (
  value: unknown,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push('configuration.global must be an object.');
    return;
  }

  validateRequiredStrings(
    value,
    [
      'clientName',
      'organization',
      'ensVersion',
      'scope',
      'evaluationPeriod',
      'timezone',
      'activePolicy',
    ],
    'configuration.global',
    errors
  );

  if (!isAllowedString(value.ensLevel, ENS_LEVELS)) {
    errors.push('configuration.global.ensLevel is invalid.');
  }

  for (const key of Object.values(ENS_DIMENSION_LEVEL_KEYS)) {
    if (key in value && !isAllowedString(value[key], ENS_LEVELS)) {
      errors.push(`configuration.global.${key} is invalid.`);
    }
  }

  if (
    value.reportLanguage !== 'es' &&
    value.reportLanguage !== 'en'
  ) {
    errors.push(
      'configuration.global.reportLanguage is invalid.',
    );
  }
};

const validateScope = (
  value: unknown,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push('configuration.scope must be an object.');
    return;
  }

  if (!isAllowedString(value.mode, SCOPE_MODES)) {
    errors.push('configuration.scope.mode is invalid.');
  }

  if (!isStringArray(value.agentIds)) {
    errors.push(
      'configuration.scope.agentIds must be a string array.',
    );
  }

  if (!isStringArray(value.groupIds)) {
    errors.push(
      'configuration.scope.groupIds must be a string array.',
    );
  }

  if (value.controlGroups !== undefined && typeof value.controlGroups !== 'boolean') {
    errors.push('configuration.scope.controlGroups must be a boolean.');
  }
};

const validateAuditEntry = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (!isAllowedString(value.action, AUDIT_ACTIONS)) {
    errors.push(`${path}.action is invalid.`);
  }

  validateRequiredStrings(
    value,
    [
      'user',
      'date',
      'summary',
    ],
    path,
    errors
  );
};

export const validateENSConfigurationStructure = (
  value: unknown
): ENSConfigurationStructureValidation => {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [
        'configuration must be an object.',
      ],
    };
  }

  validateRequiredStrings(
    value,
    [
      'id',
      'clientId',
      'version',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'changeReason',
    ],
    'configuration',
    errors
  );

  if (
    !isAllowedString(
      value.status,
      LIFECYCLE_STATUSES
    )
  ) {
    errors.push('configuration.status is invalid.');
  }

  validateGlobalConfiguration(
    value.global,
    errors
  );

  validateScope(
    value.scope,
    errors
  );

  if (!Array.isArray(value.controls)) {
    errors.push('configuration.controls must be an array.');
  } else {
    value.controls.forEach((control, index) => {
      validateControl(
        control,
        `configuration.controls[${index}]`,
        errors
      );
    });
  }

  errors.push(...validateAgentsConfigurationShape(value.agents));
  errors.push(...validateCustomTemplatesShape(value.templates));
  errors.push(...validateOrganizationDataShape(value.organizationData));
  errors.push(...validateMaturityShape(value.maturity));
  errors.push(...validateLevelAdjustmentsShape(value.levelAdjustments));

  if (!Array.isArray(value.auditTrail)) {
    errors.push('configuration.auditTrail must be an array.');
  } else {
    value.auditTrail.forEach((entry, index) => {
      validateAuditEntry(
        entry,
        `configuration.auditTrail[${index}]`,
        errors
      );
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const assertENSConfigurationVersion = (
  value: unknown
): ENSConfigurationVersion => {
  const validation =
    validateENSConfigurationStructure(value);

  if (!validation.valid) {
    throw new Error(
      [
        'Invalid ENS configuration structure:',
        ...validation.errors,
      ].join(' ')
    );
  }

  return value as ENSConfigurationVersion;
};
