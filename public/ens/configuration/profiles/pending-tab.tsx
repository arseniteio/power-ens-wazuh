import React from 'react';
import { EuiBasicTable, EuiBasicTableColumn, EuiButton, EuiButtonEmpty, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { ageLabel } from '../../../../common/ens/core/date-label';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { LoadingSpinner } from '../../../platform/loading-spinner';
import { NO_PROFILE_FILTER } from './machine-filters';
import { controlTitle, parameterTitle } from './parameter-titles';
import { machines } from './profile-labels';
import type { ENSPendingParameter } from './profiles-client';
import type { ENSHostSummaryState } from './use-host-summary';
import { ExplainedText } from '../../ui/explained-text';

interface PendingTabProps {
  summary: ENSHostSummaryState;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

export const PendingTab = ({ summary, onNavigate }: PendingTabProps) => {
  if (summary.loading && !summary.data) return <LoadingSpinner message='Buscando lo que falta por decidir...' />;
  if (summary.error && !summary.data) {
    return (
      <EuiCallOut color='danger' iconType='alert' title='No se pudo leer lo pendiente'>
        <p>{summary.error}</p>
        <EuiButton color='danger' size='s' onClick={summary.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  const data = summary.data!;
  const parameters = data.pending?.parameters || [];

  const columns: Array<EuiBasicTableColumn<ENSPendingParameter>> = [
    {
      field: 'parameterId',
      name: 'Parámetro',
      render: (_id: string, row: ENSPendingParameter) => (
        <EuiText size='s'>
          <strong>{parameterTitle(row.controlId, row.parameterId)}</strong>
          <EuiText size='xs' color='subdued'>
            <ExplainedText controlId={row.controlId} text={`${row.controlId} ${row.parameterId} · ${controlTitle(row.controlId)}`} />
          </EuiText>
        </EuiText>
      ),
    },
    {
      field: 'evidences',
      name: 'Evidencias sin evaluar',
      width: '170px',
      render: (evidences: string[]) => <EuiText size='s'>{evidences.join(', ')}</EuiText>,
    },
    { field: 'agents', name: 'Activos', width: '120px', render: (agents: number) => machines(agents) },
    {
      field: 'controlId',
      name: 'Dónde se fija',
      width: '230px',
      render: (_c: string, row: ENSPendingParameter) =>
        isAgentLevelParameter(row.controlId, row.parameterId) ? (
          <EuiButtonEmpty size='s' flush='left' onClick={() => onNavigate({ view: 'profiles' })}>
            Por activo: grupo
          </EuiButtonEmpty>
        ) : (
          <EuiButtonEmpty size='s' flush='left' onClick={() => onNavigate({ view: 'controls', controlId: row.controlId, parameterId: row.parameterId })}>
            Para toda la organización
          </EuiButtonEmpty>
        ),
    },
  ];

  return (
    <>
      <EuiSpacer size='m' />

      <EuiPanel paddingSize='m' hasBorder>
        <EuiFlexGroup alignItems='center' gutterSize='m' responsive={false}>
          <EuiFlexItem>
            <EuiTitle size='xs'>
              <h3>{data.withoutProfile ? `Activos sin grupo: ${data.withoutProfile}` : 'Activos sin grupo: 0'}</h3>
            </EuiTitle>
            <EuiText size='s' color='subdued'>
              <p>
                {data.withoutProfile
                  ? ''
                  : 'Todos los activos tienen grupo'}
              </p>
            </EuiText>
          </EuiFlexItem>
          {data.withoutProfile > 0 && (
            <>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' onClick={() => onNavigate({ view: 'machines', machineFilter: `profile:${NO_PROFILE_FILTER}` })}>
                  Ver activos
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' fill onClick={() => onNavigate({ view: 'profiles', profileId: 'nuevo' })}>
                  Nuevo grupo
                </EuiButton>
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size='m' />

      <EuiPanel paddingSize='m' hasBorder>
        <EuiTitle size='xs'>
          <h3>Parámetros sin valor</h3>
        </EuiTitle>
        <EuiText size='xs' color='subdued'>
          <p>
            {data.pending?.newest
              ? `Última pasada del motor: ${ageLabel(data.pending.newest)}`
              : data.pending
              ? 'Sin veredictos'
              : 'Veredictos no disponibles'}
          </p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiBasicTable
          items={parameters}
          itemId={(row: ENSPendingParameter) => `${row.controlId}-${row.parameterId}`}
          columns={columns}
          noItemsMessage='Sin parámetros pendientes'
        />
      </EuiPanel>
    </>
  );
};
