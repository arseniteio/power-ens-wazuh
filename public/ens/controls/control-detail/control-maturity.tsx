import React, { useMemo, useState } from 'react';
import { EuiButtonEmpty, EuiFieldSearch, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';

import type { ENSComplianceResult, ENSMachineControlResult } from '../../../../common/ens/core/evaluation/types';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { MaturitySeal } from '../../ui/maturity-seal';
import { MaturityScale } from '../../ui/maturity-scale';
import { InfoTip } from '../../ui/info-tip';
import { ENS_STATUS_ORDER, statusColor } from '../../status-colors';
import { machineName } from './parameter-panel';

const MACHINES_PREVIEW = 8;
const SEARCH_FROM = 12;

const StatusBar = ({ machines }: { machines: ENSMachineControlResult[] }) => {
  const counts = ENS_STATUS_ORDER.map(status => ({ status, count: machines.filter(m => m.status === status).length })).filter(c => c.count);
  return (
    <>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 4 }}>
        {counts.map(c => (
          <div key={c.status} title={`${statusLabel(c.status)}: ${c.count}`} style={{ flex: c.count, background: statusColor(c.status) }} />
        ))}
      </div>
      <EuiText size='xs'>
        <p style={{ marginTop: 8 }}>
          {counts.map((c, i) => (
            <React.Fragment key={c.status}>
              {i > 0 && ' · '}
              <span style={{ color: statusColor(c.status), fontWeight: 600 }}>●</span> {`${statusLabel(c.status)} ${c.count}`}
            </React.Fragment>
          ))}
        </p>
      </EuiText>
    </>
  );
};

const BelowRequired = ({ machines, onOpenMachine }: { machines: ENSMachineControlResult[]; onOpenMachine: (agentId: string) => void }) => {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? machines.filter(m => machineName(m).toLowerCase().includes(needle)) : machines;
  }, [machines, filter]);
  const visible = showAll || filter ? shown : shown.slice(0, MACHINES_PREVIEW);

  if (!machines.length) {
    return (
      <EuiText size='xs' color='subdued'>
        <span>Todas las máquinas alcanzan el nivel exigido</span>
      </EuiText>
    );
  }
  return (
    <>
      {machines.length >= SEARCH_FROM && (
        <>
          <EuiFieldSearch compressed placeholder={`Buscar en ${machines.length} máquinas`} value={filter} onChange={e => setFilter(e.target.value)} />
          <EuiSpacer size='xs' />
        </>
      )}
      {visible.map(machine => (
        <EuiFlexGroup key={machine.agentId} gutterSize='m' alignItems='center' responsive={false} style={{ padding: '3px 0' }}>
          <EuiFlexItem grow={false} style={{ minWidth: 104 }}>
            <MaturitySeal status={machine.status} compliance={machine.compliance} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size='xs'>
              <span>{machineName(machine)}</span>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='xs' onClick={() => onOpenMachine(machine.agentId)}>
              Ver máquina
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      {!showAll && !filter && shown.length > MACHINES_PREVIEW && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setShowAll(true)}>
          {`Mostrar las ${shown.length}`}
        </EuiButtonEmpty>
      )}
    </>
  );
};

export const ControlMaturity = ({
  result,
  thresholds,
  onOpenMachine,
}: {
  result: ENSComplianceResult;
  thresholds?: number[];
  onOpenMachine: (agentId: string) => void;
}) => {
  const compliance = result.compliance;
  if (!compliance) return null;
  const machines = result.machineResults || [];
  const fleet = machines.length > 1;
  const below = machines
    .filter(m => m.status !== 'CUMPLE' && m.status !== 'NO_APLICA')
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup gutterSize='xl' wrap responsive={false} alignItems='flexStart'>
        <EuiFlexItem grow={false} style={{ minWidth: 200 }}>
          <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size='xs'>
                <h3>Madurez del control</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <InfoTip
                content={
                  fleet
                    ? 'Media del cumplimiento de las máquinas, traducida a nivel CMM con la escala del control. El estado sale de comparar ese nivel con el exigido por el nivel del control.'
                    : 'Requisitos aplicables que cumplen, traducidos a nivel CMM con la escala del control. El estado sale de comparar ese nivel con el exigido por el nivel del control.'
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size='s' />
          <div style={{ fontSize: 34, fontWeight: 300, lineHeight: '40px' }}>{`${compliance.percent} %`}</div>
          <EuiText size='xs' color='subdued'>
            <p style={{ margin: '4px 0 0' }}>{fleet ? `Cumplimiento medio · ${machines.length} máquinas` : 'Cumplimiento'}</p>
          </EuiText>
          <EuiSpacer size='m' />
          <MaturitySeal status={result.status} compliance={compliance} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <MaturityScale compliance={{ ...compliance, status: result.status }} thresholds={thresholds} />
        </EuiFlexItem>
        {fleet && (
          <EuiFlexItem style={{ minWidth: 300 }}>
            <EuiText size='s'>
              <strong>{`Máquinas · ${machines.length}`}</strong>
            </EuiText>
            <EuiSpacer size='xs' />
            <StatusBar machines={machines} />
            <EuiSpacer size='m' />
            <EuiText size='xs' color='subdued'>
              <p style={{ marginBottom: 6 }}>{below.length ? `Por debajo del nivel exigido · ${below.length}` : ''}</p>
            </EuiText>
            <BelowRequired machines={below} onOpenMachine={onOpenMachine} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
