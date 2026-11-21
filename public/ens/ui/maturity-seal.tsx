import React from 'react';
import { EuiBadge, EuiToolTip } from '@elastic/eui';

import type { ENSCompliance } from '../../../common/ens/maturity/compliance-level';
import { maturityLevelName } from '../../../common/ens/maturity/compliance-level';
import { statusLabel } from '../../../common/ens/core/status-label';
import { statusBadgeColor, statusColor } from '../status-colors';
import { ENS_THEME } from '../theme-colors';

export const complianceTooltip = (compliance: ENSCompliance): string =>
  `${compliance.percent} % · L${compliance.level} ${maturityLevelName(compliance.level)} · exigido L${compliance.required} (${compliance.category})`;

// The level and the status read as one mark: the level on the left, the status it gives on the
// right in its colour. The percentage and the required level sit in the tooltip.
export const MaturitySeal = ({ status, compliance, detail }: { status: string; compliance?: ENSCompliance; detail?: string }) => {
  if (!compliance) {
    return <EuiBadge color={statusBadgeColor(status)}>{statusLabel(status)}</EuiBadge>;
  }
  const tip = [complianceTooltip(compliance), detail].filter(Boolean).join(' · ');
  return (
    <EuiToolTip position='top' content={tip}>
      <span
        tabIndex={0}
        aria-label={`${statusLabel(status)}, ${tip}`}
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          border: `1px solid ${statusColor(status)}`,
          borderRadius: 4,
          overflow: 'hidden',
          fontSize: 12,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
          verticalAlign: 'middle',
        }}
      >
        <span style={{ padding: '0 6px', fontWeight: 700, background: ENS_THEME.highlight }}>{`L${compliance.level}`}</span>
        <span style={{ padding: '0 6px', fontWeight: 600, background: statusColor(status), color: status === 'NO_APLICA' ? 'inherit' : '#fff' }}>
          {statusLabel(status)}
        </span>
      </span>
    </EuiToolTip>
  );
};
