import React from 'react';
import { EuiBasicTable, EuiButtonEmpty, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiLink, EuiPanel, EuiSpacer, EuiStat, EuiText, EuiTitle } from '@elastic/eui';
import {
  ENS_MATURITY_LABELS,
  ENS_MATURITY_MAX,
  ENS_MATURITY_NOTE,
  ENSOrganizationMaturity,
  maturityLabel,
} from '../../../common/ens/maturity/types';
import { InfoTip } from '../ui/info-tip';

interface LevelRow {
  level: number;
  accredited: number | string;
  assessed: number;
}

// The evidence accredits up to L2; L3 to L5 exist only as a documented valuation.
const ACCREDITED_MAX = 2;

const rowsOf = (data: ENSOrganizationMaturity): LevelRow[] =>
  Array.from({ length: ENS_MATURITY_MAX + 1 }, (_, level) => ({
    level,
    accredited: level > ACCREDITED_MAX ? '' : data.summary?.accredited_counts?.[level] ?? 0,
    assessed: data.summary?.assessed_counts?.[level] ?? 0,
  }));

const assessedTitle = (data: ENSOrganizationMaturity): string =>
  (data.summary?.assessed_counts || []).some(count => count > 0) ? maturityLabel(data.summary?.global_assessed) : 'Sin valorar';

const footerOf = (data: ENSOrganizationMaturity): string => {
  const s = data.summary || {};
  return [
    `${s.applicable ?? 0} medidas aplicables`,
    `sin medición todavía: ${s.unmeasured ?? 0}`,
    `sin valorar: ${s.unassessed ?? 0}`,
    `por debajo del objetivo: ${s.below_target?.length ?? 0}`,
  ].join(' · ');
};

export const OrganizationMaturityPanel = ({
  data,
  error,
  loading,
  onOpen,
  onExport,
}: {
  data?: ENSOrganizationMaturity;
  error?: string;
  loading: boolean;
  onOpen: (controlId: string) => void;
  onExport?: () => void;
}) => {
  const incoherent = Object.entries(data?.measures || {})
    .filter(([, m]) => m.incoherent)
    .map(([id]) => id)
    .sort();

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false}>
        <EuiFlexItem>
          <EuiTitle size='xs'>
            <h3>
              Madurez de la organización <InfoTip content={ENS_MATURITY_NOTE} />
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        {onExport && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' iconType='download' onClick={onExport}>
              Exportar métricas (CSV)
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      {!error && !loading && !data?.summary && (
        <EuiText size='s' color='subdued'>
          <p>Sin datos de madurez</p>
        </EuiText>
      )}
      {data?.summary && (
        <>
          <EuiFlexGroup gutterSize='m' responsive={false}>
            <EuiFlexItem>
              <EuiStat title={maturityLabel(data.summary.global_accredited)} description='Continuidad de la evidencia (30 días)' titleSize='s' />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiStat title={assessedTitle(data)} description='Madurez valorada' titleSize='s' />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size='s' />
          <EuiBasicTable<LevelRow>
            compressed
            items={rowsOf(data)}
            noItemsMessage='No hay datos.'
            columns={[
              { field: 'level', name: 'Nivel', render: (level: LevelRow['level']) => `L${level} ${ENS_MATURITY_LABELS[level]}` },
              {
                field: 'accredited',
                name: (
                  <>
                    Continuidad (30 días) <InfoTip content='La evidencia de Wazuh acredita de L0 a L2. L3 a L5 solo se valoran.' />
                  </>
                ),
                align: 'right',
                width: '190px',
              },
              { field: 'assessed', name: 'Valorada', align: 'right', width: '90px' },
            ]}
          />
          <EuiSpacer size='s' />
          <EuiText size='xs' color='subdued'>
            <p>{footerOf(data)}</p>
          </EuiText>
          {data.summary.below_target?.length ? (
            <EuiText size='xs'>
              <p>
                Por debajo del objetivo:{' '}
                {data.summary.below_target.map((id, index) => (
                  <React.Fragment key={id}>
                    {index > 0 && ', '}
                    <EuiLink onClick={() => onOpen(id)}>{id}</EuiLink>
                  </React.Fragment>
                ))}
              </p>
            </EuiText>
          ) : null}
          {incoherent.length > 0 && (
            <>
              <EuiSpacer size='s' />
              <EuiCallOut size='s' color='warning' iconType='alert' title={`Valoración superior a la acreditada: ${incoherent.join(', ')}`}>
              </EuiCallOut>
            </>
          )}
        </>
      )}
    </EuiPanel>
  );
};
