import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import type { ENSEvidenceMachineResult, ENSEvidenceResult, ENSGapCause } from '../../../../common/ens/core/evaluation/types';
import { resolveControlConfigurationWithOrigins } from '../../../../common/ens/configuration/agents/configuration-resolver';
import { displayKey, displayReason } from '../../../../common/ens/evaluation/reason-display';
import type { ReasonDisplay } from '../../../../common/ens/evaluation/reason-display';
import { formatTally } from '../../../../common/ens/core/tally';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { ENS_PROPOSAL_TEXT_PROVENANCE } from '../../../../common/ens/catalog/support/provenance';
import { statusBadgeColor } from '../../status-colors';
import { ProvenancedText } from './requirement-texts';
import { ReasonView } from './reason-view';
import type { ParameterLookup } from './reason-view';
import { MachineRef, ParameterPanel, machineName, resolveParameterViews } from './parameter-panel';

const CAUSE_LABELS: Record<ENSGapCause, string> = {
  CONFIGURATION: 'Falta configuración',
  COLLECTION: 'Sin datos del agente',
  EVIDENCE: 'Evidencia insuficiente',
  CATALOG: 'Sin evidencia en el catálogo',
};

const GROUPS_PREVIEW = 20;
const MACHINES_PREVIEW = 6;

interface ResultGroup {
  status: string;
  cause?: ENSGapCause;
  display: ReasonDisplay;
  machines: ENSEvidenceMachineResult[];
}

export const machinesOf = (evidence: ENSEvidenceResult): ENSEvidenceMachineResult[] =>
  evidence.byMachine?.length
    ? evidence.byMachine
    : [
        {
          agentId: evidence.agentId || '',
          ...(evidence.agentName ? { agentName: evidence.agentName } : {}),
          status: evidence.status,
          ...(evidence.cause ? { cause: evidence.cause } : {}),
          ...(evidence.reasonCode ? { reasonCode: evidence.reasonCode, reasonArgs: evidence.reasonArgs } : {}),
          reason: evidence.observations?.[0],
          ...(evidence.tally ? { tally: evidence.tally } : {}),
        },
      ];

export const groupResults = (machines: ENSEvidenceMachineResult[]): ResultGroup[] => {
  const groups = new Map<string, ResultGroup>();
  for (const machine of machines) {
    const display = displayReason(machine.reasonCode, machine.reasonArgs, machine.reason || '');
    const key = [machine.status, machine.cause || '', displayKey(display)].join('|');
    const group = groups.get(key) || { status: machine.status, cause: machine.cause, display, machines: [] };
    group.machines.push(machine);
    groups.set(key, group);
  }
  const rank = (status: string) => ['NO_CUMPLE', 'NO_EVALUABLE', 'PARCIAL', 'CUMPLE', 'NO_APLICA'].indexOf(status);
  return [...groups.values()].sort((a, b) => rank(a.status) - rank(b.status) || b.machines.length - a.machines.length);
};

const Machines = ({ machines }: { machines: MachineRef[] }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? machines : machines.slice(0, MACHINES_PREVIEW);
  return (
    <EuiText size='xs' color='subdued'>
      <span>{visible.map(machineName).join(', ')}</span>
      {!showAll && machines.length > MACHINES_PREVIEW && (
        <EuiButtonEmpty size='xs' onClick={() => setShowAll(true)}>
          {`y ${machines.length - MACHINES_PREVIEW} más`}
        </EuiButtonEmpty>
      )}
    </EuiText>
  );
};

const tallyLine = (group: ResultGroup): string | undefined => {
  const tally = group.machines.length === 1 ? group.machines[0].tally : undefined;
  if (!tally) return undefined;
  const required = group.display.required;
  return `${formatTally(tally)}${required && required.level ? ` · exige L${required.level} en ${required.category}` : ''}`;
};

const ResultRow = ({ group, lookup }: { group: ResultGroup; lookup: ParameterLookup }) => {
  const tally = tallyLine(group);
  return (
    <EuiPanel hasBorder paddingSize='s'>
      <EuiFlexGroup gutterSize='s' alignItems='center' wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color={statusBadgeColor(group.status)}>{statusLabel(group.status)}</EuiBadge>
        </EuiFlexItem>
        {group.cause && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow' iconType={group.cause === 'CONFIGURATION' ? 'gear' : 'alert'}>
              {CAUSE_LABELS[group.cause]}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {tally && (
          <EuiFlexItem grow={false}>
            <EuiText size='xs'>
              <strong>{tally}</strong>
            </EuiText>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiText size='xs' color='subdued'>
            <span>{group.machines.length === 1 ? '1 máquina' : `${group.machines.length} máquinas`}</span>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <Machines machines={group.machines} />
      <EuiSpacer size='xs' />
      <EuiText size='s'>
        <div>
          <ReasonView doc={group.display.doc} lookup={lookup} />
        </div>
      </EuiText>
    </EuiPanel>
  );
};

export interface EvidenceMotiveProps {
  controlId: string;
  evidence: ENSEvidenceResult;
  configuration: ENSConfigurationVersion;
  onClose: () => void;
  onConfigure?: (parameterId: string) => void;
}

export const EvidenceMotiveFlyout = ({ controlId, evidence, configuration, onClose, onConfigure }: EvidenceMotiveProps) => {
  const machines = useMemo(() => machinesOf(evidence), [evidence]);
  const groups = useMemo(() => groupResults(machines), [machines]);
  const [showAllGroups, setShowAllGroups] = useState(false);

  const definitions = useMemo(
    () => resolveControlConfigurationWithOrigins(configuration, controlId)?.configuration.parameters || [],
    [configuration, controlId]
  );
  const lookup: ParameterLookup = id => {
    const parameter = definitions.find(p => p.id === id);
    return parameter ? { label: parameter.label || parameter.name, description: parameter.description } : undefined;
  };

  const parameterIds = useMemo(() => {
    const declared = definitions.filter(p => p.id !== 'P-ATT' && (p.evidenceIds || []).includes(evidence.id)).map(p => p.id);
    const missing = groups.map(g => g.display.parameterId).filter((id): id is string => Boolean(id));
    return [...new Set([...missing, ...declared])];
  }, [definitions, groups, evidence.id]);

  const parameterViews = useMemo(
    () => resolveParameterViews(configuration, controlId, parameterIds, machines.filter(m => m.agentId)),
    [configuration, controlId, parameterIds, machines]
  );

  const visibleGroups = showAllGroups ? groups : groups.slice(0, GROUPS_PREVIEW);

  return (
    <EuiFlyout onClose={onClose} size='m' ownFocus aria-labelledby='evidence-motive-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color={statusBadgeColor(evidence.status)}>{statusLabel(evidence.status)}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size='s'>
              <h2 id='evidence-motive-title'>{`${evidence.id} · ${evidence.title}`}</h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiText size='xs' color='subdued'>
          <span>{`${controlId} · requisitos ${evidence.requirements.join(', ')}`}</span>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTitle size='xxs'>
          <h3>Comprobación</h3>
        </EuiTitle>
        <EuiSpacer size='xs' />
        <ProvenancedText provenance={ENS_PROPOSAL_TEXT_PROVENANCE} text={evidence.description} />

        {parameterViews.length > 0 && (
          <>
            <EuiHorizontalRule margin='m' />
            <EuiTitle size='xxs'>
              <h3>Parámetros de comparación</h3>
            </EuiTitle>
            <EuiSpacer size='s' />
            {parameterViews.map(view => (
              <React.Fragment key={view.id}>
                <ParameterPanel view={view} onConfigure={onConfigure} />
                <EuiSpacer size='s' />
              </React.Fragment>
            ))}
          </>
        )}

        <EuiHorizontalRule margin='m' />
        <EuiTitle size='xxs'>
          <h3>{`Resultado por máquina · ${machines.length}`}</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        {visibleGroups.map((group, i) => (
          <React.Fragment key={i}>
            <ResultRow group={group} lookup={lookup} />
            <EuiSpacer size='s' />
          </React.Fragment>
        ))}
        {!showAllGroups && groups.length > GROUPS_PREVIEW && (
          <EuiButtonEmpty size='s' onClick={() => setShowAllGroups(true)}>
            {`Mostrar los ${groups.length} resultados distintos`}
          </EuiButtonEmpty>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

export const parameterLookup = (configuration: ENSConfigurationVersion, controlId: string): ParameterLookup => {
  const definitions = resolveControlConfigurationWithOrigins(configuration, controlId)?.configuration.parameters || [];
  return id => {
    const parameter = definitions.find(p => p.id === id);
    return parameter ? { label: parameter.label || parameter.name, description: parameter.description } : undefined;
  };
};

export const evidenceParameterIds = (configuration: ENSConfigurationVersion, controlId: string, evidenceId: string): string[] =>
  (resolveControlConfigurationWithOrigins(configuration, controlId)?.configuration.parameters || [])
    .filter(p => p.id !== 'P-ATT' && (p.evidenceIds || []).includes(evidenceId))
    .map(p => p.id);

// The motive of a non-conformity: the result of its evidence on its machines, with the parameters
// that evidence compares against.
export const nonConformityMotive = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  evidence: ENSEvidenceResult,
  agentIds: string[]
) => {
  const machines = machinesOf(evidence).filter(m => !agentIds.length || agentIds.includes(m.agentId));
  const group = groupResults(machines)[0];
  if (!group) return undefined;
  const ids = [...new Set([...(group.display.parameterId ? [group.display.parameterId] : []), ...evidenceParameterIds(configuration, controlId, evidence.id)])];
  return {
    display: group.display,
    lookup: parameterLookup(configuration, controlId),
    parameters: resolveParameterViews(configuration, controlId, ids, machines.filter(m => m.agentId)),
  };
};
