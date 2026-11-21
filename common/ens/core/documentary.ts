import type { ENSRequirementResult } from './evaluation/types';

// A documentary requirement has no technical evidence: a P-ATT row with a reference and a link
// is what proves it.
export const documentaryRequirements = (requirements: ENSRequirementResult[] = []): ENSRequirementResult[] =>
  requirements.filter(requirement => !(requirement.evidenceIds || []).length && requirement.status !== 'NO_APLICA');
