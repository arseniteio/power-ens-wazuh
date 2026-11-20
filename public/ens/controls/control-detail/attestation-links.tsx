import React from 'react';
import { EuiCode, EuiLink, EuiText } from '@elastic/eui';

import type { ENSAttestation } from '../../../../common/ens/core/evaluation/types';

const opensInBrowser = (link: string): boolean => /^https?:\/\//i.test(link);

export const AttestationLinks = ({ attestation }: { attestation: ENSAttestation }) => (
  <EuiText size='xs'>
    <span>{`Cumple · documental · ${attestation.reference}`}</span>
    {attestation.links.map(link => (
      <React.Fragment key={link}>
        {' · '}
        {opensInBrowser(link) ? (
          <EuiLink href={link} target='_blank' external>
            {link}
          </EuiLink>
        ) : (
          <EuiCode transparentBackground>{link}</EuiCode>
        )}
      </React.Fragment>
    ))}
  </EuiText>
);
