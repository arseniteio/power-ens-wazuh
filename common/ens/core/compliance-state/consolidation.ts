import { sumTallies } from '../tally';
import type { ENSTally } from '../tally';
import type {
  ENSAgentRef,
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSEvidenceResult,
  ENSNonConformity,
  ENSObservationGroup,
  ENSRequirementResult,
  ENSTraceabilityResult,
} from '../evaluation/types';
import type { ENSAgentComplianceState } from './types';
import { scoreByStatus } from '../evaluation/utils/score';
import type { ENSLevel } from '../../configuration/types';
import { getActiveENSConfiguration } from '../../configuration/services/configuration-state-service';
import { judgeCompliance } from '../../maturity/compliance-level';
import type { ENSCompliance } from '../../maturity/compliance-level';
import { scaleFor } from '../../maturity/scale';

interface ENSAgentResultEntry {
  agentId: string;
  agentName?: string;
  result: ENSComplianceResult;
}

interface FleetScope {
  controlId: string;
  level: ENSLevel;
}

// A fleet complies by its CMM level, not by its worst machine: 9 of 10 machines is 90 %, L4,
// and meets ALTO. Only when nothing was measured does the old reading stay.
const fleetCompliance = (scope: FleetScope, percent: number | undefined, statuses: ENSComplianceStatus[]): ENSCompliance | undefined => {
  const applicable = statuses.filter(status => status !== 'NO_APLICA');
  if (percent === undefined || !applicable.length || applicable.every(status => status === 'NO_EVALUABLE')) return undefined;
  return judgeCompliance(percent, scope.level, scaleFor(getActiveENSConfiguration(), scope.controlId));
};

const machinesMeeting = (statuses: ENSComplianceStatus[]): ENSTally | undefined => {
  const applicable = statuses.filter(status => status !== 'NO_APLICA');
  if (!applicable.length) return undefined;
  return sumTallies(applicable.map(status => ({ met: status === 'CUMPLE' ? 1 : 0, total: 1, percent: status === 'CUMPLE' ? 100 : 0 })));
};

const attestationAmong = (requirements: ENSRequirementResult[]): Pick<ENSRequirementResult, 'attestation'> => {
  const found = requirements.find(requirement => requirement.attestation)?.attestation;
  return found ? { attestation: found } : {};
};

const uniqueValues = <T>(values: T[]): T[] => Array.from(new Set(values));

const uniqueByKey = <T>(items: T[], keyOf: (item: T) => string): T[] => {
  const itemsByKey = new Map<string, T>();

  items.forEach((item) => {
    const key = keyOf(item);

    if (!itemsByKey.has(key)) {
      itemsByKey.set(key, item);
    }
  });

  return Array.from(itemsByKey.values());
};

const getAgentLabel = (entry: Pick<ENSAgentResultEntry, 'agentId' | 'agentName'>): string =>
  entry.agentName ? `${entry.agentName} (${entry.agentId})` : entry.agentId;


const toAgentRef = (entry: ENSAgentResultEntry): ENSAgentRef => ({
  agentId: entry.agentId,
  agentName: entry.agentName,
});

const MAX_NAMED_AGENTS = 4;

const describeAgents = (agents: ENSAgentRef[]): string => {
  const labels = agents.map(getAgentLabel);

  if (labels.length === 1) {
    return labels[0];
  }

  const named = labels.slice(0, MAX_NAMED_AGENTS);
  const rest = labels.length - named.length;

  return (
    `${labels.length} activos: ${named.join(', ')}` +
    (rest > 0 ? ` y ${rest} más` : '')
  );
};

const groupObservations = (
  items: Array<{ entry: ENSAgentResultEntry; text: string }>
): ENSObservationGroup[] => {
  const groups = new Map<string, ENSObservationGroup>();

  items.forEach(({ entry, text }) => {
    const group = groups.get(text);

    if (!group) {
      groups.set(text, { text, agents: [toAgentRef(entry)] });

      return;
    }

    if (!group.agents.some((agent) => agent.agentId === entry.agentId)) {
      group.agents.push(toAgentRef(entry));
    }
  });

  return Array.from(groups.values());
};

const formatObservationGroup = (group: ENSObservationGroup): string =>
  group.agents.length === 0
    ? group.text
    : `[${describeAgents(group.agents)}] ${group.text}`;

interface ENSCardGroup<T> {
  template: T;
  agents: ENSAgentRef[];
}

const groupCards = <T>(
  items: Array<{ entry: ENSAgentResultEntry; card: T }>,
  keyOf: (card: T) => string
): Array<ENSCardGroup<T>> => {
  const groups = new Map<string, ENSCardGroup<T>>();

  items.forEach(({ entry, card }) => {
    const key = keyOf(card);
    const group = groups.get(key);

    if (!group) {
      groups.set(key, { template: card, agents: [toAgentRef(entry)] });

      return;
    }

    if (!group.agents.some((agent) => agent.agentId === entry.agentId)) {
      group.agents.push(toAgentRef(entry));
    }
  });

  return Array.from(groups.values());
};

const consolidatedCardId = (
  localId: string,
  index: number,
  agents: ENSAgentRef[]
): string => {
  const id = /^NC-\d+$/.test(localId)
    ? `NC-${String(index + 1).padStart(3, '0')}`
    : localId;

  return agents.length === 1 ? `${agents[0].agentId}:${id}` : id;
};

const getLatestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => right.localeCompare(left))[0];
};

const getEarliestIsoDate = (values: Array<string | undefined>): string | undefined => {
  const definedValues = values.filter((value): value is string => Boolean(value));

  return definedValues.sort((left, right) => left.localeCompare(right))[0];
};

const consolidateENSStatuses = (statuses: ENSComplianceStatus[]): ENSComplianceStatus => {
  const applicableStatuses = statuses.filter((status) => status !== 'NO_APLICA');

  if (applicableStatuses.length === 0) {
    return 'NO_APLICA';
  }

  if (applicableStatuses.some((status) => status === 'NO_CUMPLE')) {
    return 'NO_CUMPLE';
  }

  if (applicableStatuses.some((status) => status === 'PARCIAL')) {
    return 'PARCIAL';
  }

  if (applicableStatuses.every((status) => status === 'NO_EVALUABLE')) {
    return 'NO_EVALUABLE';
  }

  if (applicableStatuses.every((status) => status === 'CUMPLE')) {
    return 'CUMPLE';
  }

  return 'NO_EVALUABLE';
};

const averageApplicableResultValue = (
  entries: ENSAgentResultEntry[],
  selector: (result: ENSComplianceResult) => number
): number => {
  const applicableEntries = entries.filter((entry) => entry.result.status !== 'NO_APLICA');

  if (applicableEntries.length === 0) {
    return 0;
  }

  return Math.round(
    applicableEntries.reduce((sum, entry) => sum + selector(entry.result), 0) /
      applicableEntries.length
  );
};

const averageScore = (entries: ENSAgentResultEntry[]): number | undefined => {
  const scored = entries.filter(
    (entry) => typeof entry.result.score === 'number'
  );

  if (scored.length === 0) {
    return undefined;
  }

  return Math.round(
    scored.reduce((sum, entry) => sum + (entry.result.score as number), 0) / scored.length
  );
};

export const agentHasEvaluatedResults = (agent: ENSAgentComplianceState): boolean =>
  agent.results.some((result) => result.measuredRequirements > 0);

const consolidateRequirements = (entries: ENSAgentResultEntry[], scope: FleetScope): ENSRequirementResult[] => {
  const requirementIds = uniqueValues(
    entries.flatMap((entry) => entry.result.requirements.map((requirement) => requirement.id))
  );

  return requirementIds.map((requirementId) => {
    const requirementEntries = entries.flatMap((entry) =>
      entry.result.requirements
        .filter((requirement) => requirement.id === requirementId)
        .map((requirement) => ({
          entry,
          requirement,
        }))
    );

    const template = { ...requirementEntries[0].requirement };
    delete template.attested;
    delete template.attestation;
    delete template.documental;

    const evidenceIds = uniqueValues(
      requirementEntries.flatMap(({ requirement }) => requirement.evidenceIds || [])
    );

    const observationGroups = groupObservations(
      requirementEntries.flatMap(({ entry, requirement }) =>
        requirement.observations.map((text) => ({ entry, text }))
      )
    );

    const statuses = requirementEntries.map(({ requirement }) => requirement.status);
    const machines = machinesMeeting(statuses);
    const compliance = fleetCompliance(scope, machines?.percent, statuses);
    const consolidatedStatus = compliance?.status ?? consolidateENSStatuses(statuses);

    const attested =
      consolidatedStatus === 'CUMPLE' &&
      requirementEntries.some(({ requirement }) => requirement.attested === true);

    const decisive = requirementEntries.filter(
      ({ requirement }) => requirement.status === consolidatedStatus
    );
    const documental =
      decisive.length > 0 &&
      decisive.every(({ requirement }) => requirement.documental === true);

    return {
      ...template,
      status: consolidatedStatus,
      score: scoreByStatus(consolidatedStatus),
      evidenced: requirementEntries.every(
        ({ requirement }) => requirement.evidenced !== false
      ),
      ...(attested ? { attested: true } : {}),
      machines,
      ...(compliance ? { compliance } : {}),
      ...(attested ? attestationAmong(requirementEntries.map(({ requirement }) => requirement)) : {}),
      ...(documental ? { documental: true } : {}),
      level: uniqueValues(requirementEntries.flatMap(({ requirement }) => requirement.level)),
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      observations: observationGroups.map(formatObservationGroup),
      observationGroups,
    };
  });
};

const consolidateEvidences = (entries: ENSAgentResultEntry[], scope: FleetScope): ENSEvidenceResult[] => {
  const evidenceIds = uniqueValues(
    entries.flatMap((entry) => entry.result.evidences.map((evidence) => evidence.id))
  );

  return evidenceIds.map((evidenceId) => {
    const evidenceEntries = entries.flatMap((entry) =>
      entry.result.evidences
        .filter((evidence) => evidence.id === evidenceId)
        .map((evidence) => ({
          entry,
          evidence,
        }))
    );

    const template = evidenceEntries[0].evidence;

    const observationGroups = groupObservations(
      evidenceEntries.flatMap(({ entry, evidence }) =>
        (evidence.observations || []).map((text) => ({ entry, text }))
      )
    );

    return {
      ...template,
      ...evidenceFleetStatus(scope, evidenceEntries.map(({ evidence }) => evidence.status)),
      requirements: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.requirements)),
      levels: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.levels)),
      sourceTypes: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.sourceTypes)),
      expectedEventTypes: uniqueValues(
        evidenceEntries.flatMap(({ evidence }) => evidence.expectedEventTypes)
      ),
      relatedRules: uniqueValues(evidenceEntries.flatMap(({ evidence }) => evidence.relatedRules)),
      lastSeen: getLatestIsoDate(evidenceEntries.map(({ evidence }) => evidence.lastSeen)),
      tally: sumTallies(evidenceEntries.map(({ evidence }) => evidence.tally)),
      byMachine: evidenceEntries.map(({ entry, evidence }) => ({
        agentId: entry.agentId,
        ...(entry.agentName ? { agentName: entry.agentName } : {}),
        status: evidence.status,
        ...(evidence.cause ? { cause: evidence.cause } : {}),
        ...(evidence.reasonCode ? { reasonCode: evidence.reasonCode, reasonArgs: evidence.reasonArgs } : {}),
        ...(evidence.observations?.[0] ? { reason: evidence.observations[0] } : {}),
        ...(evidence.tally ? { tally: evidence.tally } : {}),
      })),

      observations: observationGroups.map(formatObservationGroup),
      observationGroups,

      agentId: undefined,
      agentName: undefined,
      resolvedEventId: undefined,
      resolvedEventType: undefined,
      resolvedSourceType: undefined,
      resolvedSource: undefined,
      resolvedRuleId: undefined,
      resolvedRuleDescription: undefined,
    };
  });
};

const nonConformityKey = (nonConformity: ENSNonConformity): string =>
  [
    nonConformity.origin,
    nonConformity.cause || '',
    (nonConformity.requirementIds || [nonConformity.requirementId]).join(','),
    nonConformity.evidenceId,
    nonConformity.finding,
    nonConformity.impact,
    nonConformity.requiredAction,
    nonConformity.expected || '',
    nonConformity.actual || '',
    (nonConformity.evidenceIds || []).join(','),
    (nonConformity.parameterIds || []).join(','),
  ].join('|');

const consolidateNonConformities = (entries: ENSAgentResultEntry[]): ENSNonConformity[] =>
  groupCards(
    entries.flatMap((entry) =>
      entry.result.nonConformities.map((card) => ({ entry, card }))
    ),
    nonConformityKey
  ).map(({ template, agents }, index) => {
    const cardAgents = template.cause === 'CATALOG' ? [] : agents;

    return {
      ...template,
      id: consolidatedCardId(template.id, index, cardAgents),
      agents: cardAgents,
    };
  });

const consolidateTraceability = (entries: ENSAgentResultEntry[]): ENSTraceabilityResult[] =>
  uniqueByKey(
    entries.flatMap((entry) =>
      entry.result.traceability.map((trace) => ({
        ...trace,
        agentId: trace.agentId || entry.agentId,
        agentName: trace.agentName || entry.agentName,
      }))
    ),
    (trace) =>
      [
        trace.source,
        trace.reference,
        trace.agentId || '',
        trace.status || '',
        trace.eventId || '',
        trace.requirementId || '',
        trace.evidenceId || '',
      ].join('|')
  );

const consolidateObservations = (entries: ENSAgentResultEntry[]): string[] =>
  groupObservations(
    entries.flatMap((entry) =>
      entry.result.observations.map((text) => ({ entry, text }))
    )
  ).map(formatObservationGroup);

const evidenceFleetStatus = (scope: FleetScope, statuses: ENSComplianceStatus[]): Pick<ENSEvidenceResult, 'status' | 'compliance'> => {
  const compliance = fleetCompliance(scope, machinesMeeting(statuses)?.percent, statuses);
  return compliance ? { status: compliance.status, compliance } : { status: consolidateENSStatuses(statuses) };
};

// Every applicable machine weighs the same; one without a score (no verdict yet) counts as 0 %
// so a silent machine never lifts the fleet.
const applicableAverage = (entries: ENSAgentResultEntry[]): number | undefined => {
  const applicable = entries.filter(entry => entry.result.status !== 'NO_APLICA');
  if (!applicable.length) return averageScore(entries);
  return Math.round(applicable.reduce((sum, entry) => sum + (typeof entry.result.score === 'number' ? entry.result.score : 0), 0) / applicable.length);
};

const controlFleetStatus = (scope: FleetScope, entries: ENSAgentResultEntry[], score: number | undefined): Pick<ENSComplianceResult, 'status' | 'compliance'> => {
  const statuses = entries.map(entry => entry.result.status);
  if (entries.length === 1) {
    const only = entries[0].result;
    return { status: only.status, ...(only.compliance ? { compliance: only.compliance } : {}) };
  }
  const compliance = fleetCompliance(scope, score, statuses);
  return compliance ? { status: compliance.status, compliance } : { status: consolidateENSStatuses(statuses) };
};

const consolidateControlResult = (entries: ENSAgentResultEntry[]): ENSComplianceResult => {
  const template = entries[0].result;
  const scope: FleetScope = { controlId: template.control.id, level: template.level };
  const score = applicableAverage(entries);

  return {
    ...template,
    control: {
      ...template.control,
    },

    consolidatedAgents: uniqueByKey(entries.map(toAgentRef), (agent) => agent.agentId),

    ...controlFleetStatus(scope, entries, score),
    score,
    machineResults: entries.map(entry => ({
      agentId: entry.agentId,
      ...(entry.agentName ? { agentName: entry.agentName } : {}),
      status: entry.result.status,
      ...(typeof entry.result.score === 'number' ? { score: entry.result.score } : {}),
      ...(entry.result.compliance ? { compliance: entry.result.compliance } : {}),
    })),
    coverage: averageApplicableResultValue(entries, (result) => result.coverage),

    applicableRequirements: entries.reduce(
      (sum, entry) => sum + entry.result.applicableRequirements,
      0
    ),
    measuredRequirements: entries.reduce(
      (sum, entry) => sum + entry.result.measuredRequirements,
      0
    ),
    unmeasuredRequirements: entries.flatMap((entry) =>
      entry.result.unmeasuredRequirements.map(
        (requirementId) => `${entry.agentId}:${requirementId}`
      )
    ),

    evaluatedAt:
      getLatestIsoDate(entries.map((entry) => entry.result.evaluatedAt)) || template.evaluatedAt,
    lastEvidenceAt: getLatestIsoDate(entries.map((entry) => entry.result.lastEvidenceAt)),
    nextReviewAt: getEarliestIsoDate(entries.map((entry) => entry.result.nextReviewAt)),

    requirements: consolidateRequirements(entries, scope),

    parameters: template.parameters.map((parameter) => ({
      ...parameter,
    })),

    evidences: consolidateEvidences(entries, scope),

    missingParameters: uniqueValues(entries.flatMap((entry) => entry.result.missingParameters)),
    missingEvidences: uniqueValues(entries.flatMap((entry) => entry.result.missingEvidences)),
    relatedRules: uniqueValues(entries.flatMap((entry) => entry.result.relatedRules)),

    nonConformities: consolidateNonConformities(entries),

    observations: consolidateObservations(entries),

    traceability: consolidateTraceability(entries),
  };
};

export const consolidateAgentComplianceResultByControl = (
  agents: ENSAgentComplianceState[],
  controlId: string
): ENSComplianceResult | undefined => {
  const entries = agents.flatMap((agent) =>
    agent.results
      .filter((result) => result.control.id === controlId)
      .map((result) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        result,
      }))
  );

  return entries.length > 0 ? consolidateControlResult(entries) : undefined;
};
