import type { ENSMaturityConfiguration } from '../../maturity/types';
import type { ENSLevelAdjustment } from '../levels/level-adjustments';
import type {
  ENSAgentParameterValue,
  ENSAgentsConfiguration,
  ENSCustomTemplate,
  ENSMatchMode,
} from '../../../agent-configuration';

export type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSAgentsConfiguration,
  ENSCustomTemplate,
  ENSMatchMode,
  ENSSystemType,
} from '../../../agent-configuration';

export type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export type ENSParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'list'
  | 'path'
  | 'url'
  | 'duration_hours'
  | 'duration_days'
  | 'table';

export type ENSParameterColumnType =
  | 'string'
  | 'identifier'
  | 'path'
  | 'octal'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect';

export interface ENSParameterColumn {
  name: string;
  label: string;
  type: ENSParameterColumnType;
  required: boolean;
  options?: string[];
  variadic?: boolean;
}

export type ENSParameterStatus =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'NOT_APPLICABLE'
  | 'INVALID';

export type ENSConfigurationScopeMode = 'global' | 'agent' | 'group';

export interface ENSConfigurationScope {
  mode: ENSConfigurationScopeMode;
  agentIds: string[];
  groupIds: string[];
  controlGroups?: boolean;
}

export interface ENSGlobalConfiguration {
  clientName: string;
  organization: string;
  ensLevel: ENSLevel;
  confidentialityLevel?: ENSLevel;
  integrityLevel?: ENSLevel;
  traceabilityLevel?: ENSLevel;
  authenticityLevel?: ENSLevel;
  availabilityLevel?: ENSLevel;
  ensVersion: string;
  scope: string;
  evaluationPeriod: string;
  timezone: string;
  reportLanguage: 'es' | 'en';
  activePolicy: string;
}

export interface ENSControlParameter {
  id: string;
  controlId: string;
  name: string;
  label: string;
  description: string;
  levels: ENSLevel[];
  requirements: string[];
  type: ENSParameterType;
  matchMode?: ENSMatchMode;
  example?: string;
  options?: string[];
  optionsByLevel?: Partial<Record<ENSLevel, string[]>>;
  columns?: ENSParameterColumn[];
  required: boolean;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string | number | boolean | string[];
  value?: string | number | boolean | string[];
  wazuhUsage: string;
  powerEnsUsage: string;
  evidenceIds: string[];
  ruleIds: string[];
  ifNotConfigured: string;
  status?: ENSParameterStatus;
}

export interface ENSControlConfiguration {
  controlId: string;
  controlName: string;
  family: string;
  enabled: boolean;
  applicableLevels: ENSLevel[];
  parameters: ENSControlParameter[];
}

export interface ENSParameterValueVerdict {
  valid: boolean;
  reason?: string;
}

export interface ENSParameterValueIssue {
  parameterId: string;
  parameterName: string;
  label: string;
  required: boolean;
  reason: string;
}

export interface ENSControlConfigurationValidation {
  controlId: string;
  controlName: string;
  activeLevel: ENSLevel;
  totalParameters: number;
  configured: number;
  notConfigured: number;
  notApplicable: number;
  invalid: number;
  missingRequired: ENSControlParameter[];
  invalidParameters: ENSControlParameter[];
  invalidRequired: ENSControlParameter[];
  issues: ENSParameterValueIssue[];
  status: 'CONFIGURED' | 'INCOMPLETE' | 'INVALID';
  parameters: ENSControlParameter[];
}

export interface ENSConfigurationVersion {
  id: string;
  clientId: string;
  version: string;
  status: ENSConfigurationLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  changeReason: string;
  global: ENSGlobalConfiguration;
  scope: ENSConfigurationScope;
  controls: ENSControlConfiguration[];
  auditTrail: ENSConfigurationAuditEntry[];
  agents?: ENSAgentsConfiguration;
  templates?: ENSCustomTemplate[];
  organizationData?: ENSOrganizationData;
  maturity?: ENSMaturityConfiguration;
  levelAdjustments?: ENSLevelAdjustment[];
}

export interface ENSOrganizationData {
  values: Record<string, ENSAgentParameterValue>;
}
export type ENSConfigurationLifecycleStatus =
  | 'DRAFT'
  | 'CONFIGURED'
  | 'INCOMPLETE'
  | 'INVALID'
  | 'ACTIVE'
  | 'ARCHIVED';

export type ENSControlParameterValues = Record<
  string,
  ENSControlParameter['value']
>;

export interface ENSConfigurationAuditEntry {
  action: 'CREATED' | 'UPDATED' | 'VALIDATED' | 'RESET';
  user: string;
  date: string;
  summary: string;
}

