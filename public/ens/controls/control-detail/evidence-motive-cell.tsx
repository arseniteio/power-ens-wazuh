import React, { useMemo } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiText } from '@elastic/eui';

import type { ENSEvidenceResult } from '../../../../common/ens/core/evaluation/types';
import { reasonDocText } from '../../../../common/ens/catalog/engine-messages';
import { groupResults, machinesOf } from './evidence-motive';

const SUMMARY_MAX = 160;

const shorten = (text: string): string => (text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX).trimEnd()}…` : text);

export const EvidenceMotiveCell = ({ evidence, onOpen }: { evidence: ENSEvidenceResult; onOpen: () => void }) => {
  const groups = useMemo(() => groupResults(machinesOf(evidence)), [evidence]);
  const first = groups[0];
  if (!first) {
    return (
      <EuiText size='xs' color='subdued'>
        Sin motivo registrado
      </EuiText>
    );
  }
  const machines = groups.reduce((sum, group) => sum + group.machines.length, 0);
  return (
    <EuiText size='xs'>
      <p style={{ marginBottom: 2 }}>
        {first.cause === 'CONFIGURATION' && (
          <>
            <EuiBadge color='hollow' iconType='gear'>
              Falta configuración
            </EuiBadge>{' '}
          </>
        )}
        {shorten(reasonDocText(first.display.doc))}
      </p>
      <EuiButtonEmpty size='xs' flush='left' iconType='inspect' onClick={onOpen}>
        {groups.length > 1 ? `Ver motivo · ${groups.length} resultados en ${machines} máquinas` : 'Ver motivo'}
      </EuiButtonEmpty>
    </EuiText>
  );
};
