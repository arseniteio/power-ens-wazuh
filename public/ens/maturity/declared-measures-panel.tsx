import React, { useState } from 'react';
import { EuiBasicTable, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { InfoTip } from '../ui/info-tip';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { assessmentOf } from '../../../common/ens/maturity/assessments';
import { ENS_DECLARED_MEASURES } from '../../../common/ens/maturity/declared-measures';
import { maturityLabel } from '../../../common/ens/maturity/types';
import { AssessModal } from './measure-maturity';
import { ExplainedText } from '../ui/explained-text';

type Row = (typeof ENS_DECLARED_MEASURES)[number];

export const DeclaredMeasuresPanel = ({ configuration, onSaved }: { configuration: ENSConfigurationVersion; onSaved: () => void }) => {
  const [assessing, setAssessing] = useState<string | undefined>();

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size='xs'>
            <h3>Medidas sin motor</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <InfoTip content='Medidas citadas por los controles sin medición de Power ENS. Solo nivel valorado; computan en la madurez de la organización sin nivel acreditado.' />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <EuiBasicTable<Row>
        compressed
        items={ENS_DECLARED_MEASURES}
        noItemsMessage='No hay medidas.'
        columns={[
          { field: 'id', name: 'Medida', width: '100px' },
          { field: 'name', name: 'Nombre' },
          { field: 'citedFrom', name: 'Citada en', width: '200px' },
          {
            field: 'id',
            name: 'Valorado',
            width: '210px',
            render: (id: string) => {
              const a = assessmentOf(configuration, id);
              return a?.level === undefined ? 'sin valorar' : <ExplainedText text={`${maturityLabel(a.level)}${a.target === undefined ? '' : ` · objetivo L${a.target}`}`} />;
            },
          },
          {
            field: 'id',
            name: '',
            width: '90px',
            render: (id: string) => (
              <EuiButtonEmpty size='xs' onClick={() => setAssessing(id)}>
                Valorar
              </EuiButtonEmpty>
            ),
          },
        ]}
      />
      {assessing && <AssessModal measureId={assessing} onClose={() => setAssessing(undefined)} onSaved={onSaved} />}
    </EuiPanel>
  );
};
