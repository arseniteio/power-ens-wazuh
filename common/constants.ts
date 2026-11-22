
export const POWER_ENS_PLUGIN_ID = 'powerEns';
export const POWER_ENS_APP_TITLE = 'Power ENS';
export const POWER_ENS_APP_ORDER = 401;

export const POWER_ENS_APP_CATEGORY = {
  id: 'wz-category-security-operations',
  label: 'Security operations',
  order: 400,
  euiIconType: 'securityApp' as const,
};

const POWER_ENS_API_BASE = '/api/powerEns';
export const POWER_ENS_CONFIGURATION_PATH = `${POWER_ENS_API_BASE}/configuration`;
export const POWER_ENS_EVALUATION_PATH = `${POWER_ENS_API_BASE}/evaluation`;
export const POWER_ENS_EXCLUSIONS_PATH = `${POWER_ENS_API_BASE}/exclusions`;
export const POWER_ENS_PROFILES_PATH = `${POWER_ENS_API_BASE}/profiles`;
export const POWER_ENS_HOSTS_PATH = `${POWER_ENS_API_BASE}/hosts`;
export const POWER_ENS_MATURITY_PATH = `${POWER_ENS_API_BASE}/maturity`;
export const POWER_ENS_SYSTEMS_PATH = `${POWER_ENS_API_BASE}/systems`;

export const ENS_ALERTS_INDEX = 'wazuh-alerts-*';
export const ENS_MONITORING_INDEX = 'wazuh-monitoring-*';
export const ENS_CONFIGURATION_INDEX = 'wazuh-ens-configuration';
export const ENS_VERDICTS_INDEX = 'oscompliance-verdicts';
export const ENS_EXCLUSIONS_INDEX = 'wazuh-ens-exclusions';
export const ENS_HOST_PROFILE_INDEX = 'oscompliance-host-profile';

export const POWER_ENS_ADMIN_ROLES = ['power_ens_admin', 'all_access'];
