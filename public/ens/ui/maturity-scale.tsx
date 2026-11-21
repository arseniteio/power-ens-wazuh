import React from 'react';
import { EuiText, EuiToolTip } from '@elastic/eui';

import type { ENSCompliance } from '../../../common/ens/maturity/compliance-level';
import { CCN_SCALE, MATURITY_LEVELS } from '../../../common/ens/maturity/compliance-level';
import { statusColor } from '../status-colors';
import { ENS_THEME } from '../theme-colors';

// L0 to L5 side by side with the minimum percentage of each: the reached level is filled, the
// required one is marked, so 82 % meeting MEDIO reads at a glance.
export const MaturityScale = ({ compliance, thresholds = CCN_SCALE }: { compliance: ENSCompliance; thresholds?: number[] }) => (
  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }} role='img' aria-label={`Escala de madurez: L${compliance.level} alcanzado, L${compliance.required} exigido`}>
    {MATURITY_LEVELS.map(level => {
      const minimum = level.level === 0 ? 0 : thresholds[level.level - 1];
      const reached = level.level <= compliance.level;
      const current = level.level === compliance.level;
      const required = level.level === compliance.required;
      return (
        <EuiToolTip key={level.level} content={`L${level.level} ${level.name} · desde ${minimum} % · ${level.meaning}${required ? ` · exigido en ${compliance.category}` : ''}`}>
          <div style={{ width: 92 }}>
            <EuiText size='xs' color='subdued'>
              <div style={{ height: 16, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', color: required ? ENS_THEME.primary : undefined }}>
                {required ? 'Exigido' : ''}
              </div>
            </EuiText>
            <div
              style={{
                height: 30,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                background: reached ? statusColor(compliance.status) : ENS_THEME.highlight,
                color: reached ? '#fff' : ENS_THEME.subduedText,
                outline: required ? `2px solid ${ENS_THEME.primary}` : undefined,
                outlineOffset: 1,
                boxShadow: current ? 'inset 0 -3px 0 rgba(0,0,0,0.25)' : undefined,
              }}
            >
              {`L${level.level}`}
            </div>
            <EuiText size='xs' color='subdued'>
              <div style={{ textAlign: 'center', marginTop: 2 }}>{`≥ ${minimum} %`}</div>
            </EuiText>
          </div>
        </EuiToolTip>
      );
    })}
  </div>
);
