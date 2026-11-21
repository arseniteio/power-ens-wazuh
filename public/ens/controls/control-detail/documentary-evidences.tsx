import React from 'react';
import { EuiBadge, EuiBasicTable, EuiButtonEmpty, EuiCode, EuiFlexGroup, EuiFlexItem, EuiLink, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';

import type { ENSRequirementResult } from '../../../../common/ens/core/evaluation/types';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { statusBadgeColor } from '../../status-colors';
import { InfoTip } from '../../ui/info-tip';

const opensInBrowser = (link: string): boolean => /^https?:\/\//i.test(link);

const DocumentLinks = ({ requirement, onConfigure }: { requirement: ENSRequirementResult; onConfigure?: () => void }) => {
  const attestation = requirement.attestation;
  if (!attestation) {
    return (
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size='xs' color='subdued'>
            <span>Sin documento con referencia y enlace en P-ATT</span>
          </EuiText>
        </EuiFlexItem>
        {onConfigure && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='xs' iconType='gear' onClick={onConfigure}>
              Configurar P-ATT
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  }
  return (
    <EuiText size='s'>
      <div>
        <strong>{attestation.reference}</strong>
      </div>
      {attestation.links.map(link => (
        <div key={link}>
          {opensInBrowser(link) ? (
            <EuiLink href={link} target='_blank' external>
              {link}
            </EuiLink>
          ) : (
            <EuiCode>{link}</EuiCode>
          )}
        </div>
      ))}
    </EuiText>
  );
};

export const DocumentaryEvidences = ({
  requirements,
  onConfigure,
}: {
  requirements: ENSRequirementResult[];
  onConfigure?: (parameterId: string) => void;
}) => {
  if (!requirements.length) return null;
  return (
    <>
      <EuiSpacer size='l' />
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size='xs'>
            <h3>{`Evidencias documentales · ${requirements.length}`}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <InfoTip content='Requisitos que se acreditan con un documento: una fila de P-ATT con referencia y enlace.' />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <EuiBasicTable<ENSRequirementResult>
        items={requirements}
        noItemsMessage='No hay requisitos documentales.'
        columns={[
          { field: 'id', name: 'Requisito ENS', width: '150px', render: (id: string) => <strong>{id}</strong> },
          { field: 'title', name: 'Título' },
          {
            field: 'status',
            name: 'Estado',
            width: '150px',
            render: (status: string) => <EuiBadge color={statusBadgeColor(status)}>{statusLabel(status)}</EuiBadge>,
          },
          {
            field: 'id',
            name: 'Documento',
            render: (_: string, requirement: ENSRequirementResult) => (
              <DocumentLinks requirement={requirement} onConfigure={onConfigure ? () => onConfigure('P-ATT') : undefined} />
            ),
          },
        ]}
      />
    </>
  );
};
