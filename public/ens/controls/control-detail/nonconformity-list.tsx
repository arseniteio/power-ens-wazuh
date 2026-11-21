import React, { useMemo, useState } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, EuiTitle, EuiToolTip } from '@elastic/eui';

import type { ENSAgentRef, ENSEvidenceResult, ENSNonConformity } from '../../../../common/ens/core/evaluation/types';
import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { nonConformityMotive } from './evidence-motive';
import { ReasonView } from './reason-view';
import { machineName } from './parameter-panel';
import type { ParameterView } from './parameter-panel';
import { groupNonConformities } from '../../../../common/ens/core/nonconformity-groups';
import type { GroupedNonConformity, NonConformityKind as Kind } from '../../../../common/ens/core/nonconformity-groups';

const KINDS: Record<Kind, { label: string; color: string; order: number }> = {
  measure: { label: 'Incumplimiento', color: 'danger', order: 0 },
  configuration: { label: 'Falta configuración', color: 'warning', order: 1 },
  collection: { label: 'Sin datos', color: 'default', order: 2 },
  documentary: { label: 'Sin documento', color: 'hollow', order: 3 },
};

const MACHINES_PREVIEW = 4;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <EuiFlexGroup gutterSize='m' responsive={false} style={{ padding: '5px 0' }}>
    <EuiFlexItem grow={false} style={{ width: 120, flexShrink: 0 }}>
      <EuiText size='xs' color='subdued'>
        <span>{label}</span>
      </EuiText>
    </EuiFlexItem>
    <EuiFlexItem>{children}</EuiFlexItem>
  </EuiFlexGroup>
);

const Machines = ({ machines }: { machines: ENSAgentRef[] }) => {
  const [showAll, setShowAll] = useState(false);
  if (!machines.length) {
    return (
      <EuiText size='s'>
        <span>Organización</span>
      </EuiText>
    );
  }
  const visible = showAll ? machines : machines.slice(0, MACHINES_PREVIEW);
  return (
    <EuiText size='s'>
      <span>{visible.map(machineName).join(', ')}</span>
      {!showAll && machines.length > MACHINES_PREVIEW && (
        <EuiButtonEmpty size='xs' onClick={() => setShowAll(true)}>
          {`y ${machines.length - MACHINES_PREVIEW} más`}
        </EuiButtonEmpty>
      )}
    </EuiText>
  );
};

const valueSummary = (view: ParameterView): string => {
  const rows = view.groups[0]?.rows || [];
  if (view.groups.length > 1) return 'varía por máquina';
  if (!rows.length) return 'sin valor';
  if (view.groups[0].regex) return `expresión regular ${rows[0]}`;
  return rows.length === 1 ? rows[0] : `${rows.length} entradas`;
};

export interface NonConformityListProps {
  items: ENSNonConformity[];
  controlId: string;
  configuration: ENSConfigurationVersion;
  findEvidence: (evidenceId: string) => ENSEvidenceResult | undefined;
  requirementTitle: (requirementId: string) => string | undefined;
  criticalityOf: (evidenceIds: string[]) => string | undefined;
  onConfigure: (parameterId: string) => void;
  onOpenMotive: (evidenceId: string, agentIds: string[]) => void;
}

const Card = ({ group, props }: { group: GroupedNonConformity; props: NonConformityListProps }) => {
  const evidence = group.evidenceId ? props.findEvidence(group.evidenceId) : undefined;
  const agentIds = group.machines.map(m => m.agentId);
  const motive = evidence ? nonConformityMotive(props.configuration, props.controlId, evidence, agentIds) : undefined;
  const kind = KINDS[group.kind];
  const criticality = group.evidenceId ? props.criticalityOf([group.evidenceId]) : undefined;
  const missing =
    motive?.display.parameterId ||
    (group.kind === 'configuration' ? motive?.parameters.find(view => view.groups.some(g => g.rows.length === 0))?.id : undefined);
  const title = evidence
    ? `${evidence.id} · ${evidence.title}`
    : `${group.requirementIds[0]} · ${props.requirementTitle(group.requirementIds[0]) || ''}`;

  return (
    <EuiPanel hasBorder paddingSize='m'>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color={kind.color}>{kind.label}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size='s'>
            <strong>{title}</strong>
          </EuiText>
        </EuiFlexItem>
        {criticality && (
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              <span>{`Criticidad ${criticality}`}</span>
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='s' />

      {evidence && (
      <Row label='Requisitos'>
        <EuiText size='s'>
          <span>
            {group.requirementIds.map((id, i) => (
              <React.Fragment key={id}>
                {i > 0 && ' · '}
                <strong>{id}</strong> {props.requirementTitle(id) || ''}
              </React.Fragment>
            ))}
          </span>
        </EuiText>
      </Row>
      )}

      <Row label={group.machines.length > 1 ? `Máquinas · ${group.machines.length}` : 'Máquina'}>
        <Machines machines={group.machines} />
      </Row>

      <Row label='Motivo'>
        <EuiText size='s'>
          <div>
            {motive ? (
              <ReasonView doc={motive.display.doc} lookup={motive.lookup} />
            ) : (
              <span>Sin documento con referencia y enlace en P-ATT</span>
            )}
          </div>
        </EuiText>
      </Row>

      {motive && motive.parameters.length > 0 && (
        <Row label='Comparado con'>
          <div>
            {motive.parameters.map(view => (
              <div key={view.id} style={{ marginBottom: 4 }}>
                <EuiToolTip content={view.description}>
                  <EuiText size='s'>
                    <span>
                      <strong>{view.id}</strong> {view.label}: <em>{valueSummary(view)}</em>
                    </span>
                  </EuiText>
                </EuiToolTip>
              </div>
            ))}
          </div>
        </Row>
      )}

      <Row label='Acción'>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiText size='s'>
              <span>
                {group.kind === 'measure'
                  ? `Corregir en ${group.machines.length > 1 ? 'las máquinas' : 'la máquina'} lo que señala ${group.evidenceId}`
                  : group.kind === 'configuration'
                  ? missing ? `Dar valor a ${missing}` : 'Completar los parámetros de la evidencia'
                  : group.kind === 'collection'
                  ? 'Revisar el agente y la recogida de datos de la máquina'
                  : 'Registrar el documento con referencia y enlace'}
              </span>
            </EuiText>
          </EuiFlexItem>
          {group.kind === 'configuration' && missing && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='xs' iconType='gear' onClick={() => props.onConfigure(missing)}>
                {`Configurar ${missing}`}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
          {group.kind === 'documentary' && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='xs' iconType='gear' onClick={() => props.onConfigure('P-ATT')}>
                Configurar P-ATT
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
          {evidence && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size='xs' iconType='inspect' onClick={() => props.onOpenMotive(evidence.id, agentIds)}>
                Ver motivo y parámetros
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </Row>
    </EuiPanel>
  );
};

export const NonConformityList = (props: NonConformityListProps) => {
  const groups = useMemo(() => groupNonConformities(props.items), [props.items]);
  const counts = (Object.keys(KINDS) as Kind[])
    .map(kind => ({ kind, count: groups.filter(g => g.kind === kind).length }))
    .filter(c => c.count);

  return (
    <>
      <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiTitle size='xs'>
            <h3>{`No conformidades · ${groups.length}`}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {counts.map(c => (
          <EuiFlexItem grow={false} key={c.kind}>
            <EuiBadge color={KINDS[c.kind].color}>{`${KINDS[c.kind].label} · ${c.count}`}</EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
      <EuiSpacer size='m' />
      {groups.map(group => (
        <React.Fragment key={group.key}>
          <Card group={group} props={props} />
          <EuiSpacer size='m' />
        </React.Fragment>
      ))}
    </>
  );
};
