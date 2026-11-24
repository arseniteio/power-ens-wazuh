import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { ENS_STATUS_COLORS } from '../status-colors';
import { ENS_THEME } from '../theme-colors';
import { EVALUATION_ERROR_TITLE, evaluationErrorText } from '../../platform/facts-read-error';
import { controlRowWaitLabel } from './control-row-state';
import type { ENSControlListEntry, ENSMachineTally } from './controls-list-model';
import { describeTally } from './controls-list-model';
import { AddControlWithDefaultsButton } from './add-control-button';
import { ENS_PENDING_MEASUREMENT_LABEL } from '../../../common/ens/catalog';
import { MaturitySeal } from '../ui/maturity-seal';

interface ControlRowProps {
  entry: ENSControlListEntry;
  isLoading: boolean;
  error?: Error;
  statusColor: (status: string) => string;
  statusBadge: (status: string) => string;
  onSelect: () => void;
  onConfigurationChanged?: () => void;
}

const CONTROL_COLUMNS = { status: 130, machines: 280, nonConformities: 120 };

const shortTally = (tally: ENSMachineTally): string => {
  const parts = [
    tally.nonCompliant ? `${tally.nonCompliant} no cumplen` : '',
    tally.partial ? `${tally.partial} parciales` : '',
    tally.noData ? `${tally.noData} sin datos` : '',
    tally.compliant ? `${tally.compliant} cumplen` : '',
  ].filter(Boolean);
  return parts.slice(0, 2).join(' · ') || `${tally.total} activos`;
};

const MachineTallyBar = ({ tally }: { tally: ENSMachineTally }) => {
  const spans = [
    { status: 'CUMPLE', n: tally.compliant },
    { status: 'PARCIAL', n: tally.partial },
    { status: 'NO_CUMPLE', n: tally.nonCompliant },
    { status: 'NO_EVALUABLE', n: tally.noData },
    { status: 'NO_APLICA', n: tally.notApplicable },
  ].filter(barSpan => barSpan.n > 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={`Activos: ${describeTally(tally)}`}>
      <span style={{ display: 'inline-flex', width: 100, height: 6, borderRadius: 3, overflow: 'hidden', background: ENS_THEME.track, flexShrink: 0 }}>
        {spans.map(barSpan => (
          <span key={barSpan.status} style={{ width: `${(barSpan.n / tally.total) * 100}%`, background: ENS_STATUS_COLORS[barSpan.status] }} />
        ))}
      </span>
      <EuiText size='xs' color='subdued'>
        <span>{shortTally(tally)}</span>
      </EuiText>
    </div>
  );
};

export const ControlListHeader = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false} style={{ padding: '0 12px 6px', borderBottom: `1px solid ${ENS_THEME.border}` }}>
    <EuiFlexItem><EuiText size='xs' color='subdued'><strong>Control</strong></EuiText></EuiFlexItem>
    <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.status }}><EuiText size='xs' color='subdued'><strong>Estado</strong></EuiText></EuiFlexItem>
    <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.machines }}><EuiText size='xs' color='subdued'><strong>Activos</strong></EuiText></EuiFlexItem>
    <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.nonConformities, textAlign: 'right' }}><EuiText size='xs' color='subdued'><strong>No conformidades</strong></EuiText></EuiFlexItem>
  </EuiFlexGroup>
);

export const ControlRow = ({ entry, isLoading, error, statusColor, onSelect, onConfigurationChanged }: ControlRowProps) => {
  const { id: controlId, title, levels, summary } = entry;

  const row = (dot: string, statusCell: React.ReactNode, machinesCell?: React.ReactNode, ncCell?: React.ReactNode, muted = false) => (
    <EuiFlexGroup
      gutterSize='m'
      alignItems='center'
      responsive={false}
      onClick={onSelect}
      style={{ padding: '10px 12px', borderBottom: `1px solid ${ENS_THEME.border}`, cursor: 'pointer', opacity: muted ? 0.65 : 1 }}
    >
      <EuiFlexItem>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'block' }} />
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ minWidth: 72 }}>
            <EuiText size='s'><strong>{controlId}</strong></EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size='s' title={`Niveles: ${levels}`}><span>{title}</span></EuiText>
          </EuiFlexItem>
          {!entry.configured && (
            <EuiFlexItem grow={false} onClick={(event: React.MouseEvent) => event.stopPropagation()}>
              <AddControlWithDefaultsButton controlId={controlId} onAdded={onConfigurationChanged} />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.status }}>{statusCell}</EuiFlexItem>
      <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.machines }}>{machinesCell}</EuiFlexItem>
      <EuiFlexItem grow={false} style={{ width: CONTROL_COLUMNS.nonConformities, textAlign: 'right' }}>{ncCell}</EuiFlexItem>
    </EuiFlexGroup>
  );

  const subdued = (text: string, tip?: string) => (
    <EuiText size='xs' color='subdued' title={tip}><span>{text}</span></EuiText>
  );

  if (entry.notMeasured) return row(ENS_THEME.track, subdued('No se mide', entry.notMeasured.text), undefined, undefined, true);

  if (entry.pendingMeasurement) return row(ENS_THEME.track, subdued(ENS_PENDING_MEASUREMENT_LABEL, entry.pendingMeasurement), undefined, undefined, true);

  const waitLabel = error ? undefined : controlRowWaitLabel(isLoading, summary);
  if (waitLabel) return row(ENS_THEME.track, <EuiLoadingSpinner size='s' />);

  if (error) return row(ENS_THEME.dangerText, <EuiBadge color='danger' title={evaluationErrorText(error)}>{EVALUATION_ERROR_TITLE}</EuiBadge>);

  const status = summary?.status || 'NO_EVALUABLE';
  const nonConformities = summary?.requirementsNotMet || 0;
  const unproven = summary?.requirementsNotEvidenced || 0;

  return row(
    statusColor(status),
    <MaturitySeal status={status} compliance={summary?.compliance} />,
    entry.machines ? <MachineTallyBar tally={entry.machines} /> : undefined,
    <EuiText size='s' color={nonConformities ? 'danger' : 'subdued'} title={unproven ? `${unproven} sin evidencia` : undefined}>
      <strong>{nonConformities || '—'}</strong>
    </EuiText>
  );
};
