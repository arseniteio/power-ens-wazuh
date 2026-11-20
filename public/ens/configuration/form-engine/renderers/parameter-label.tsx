import React from 'react';

import { InfoTip } from '../../../ui/info-tip';

interface ParameterLabelProps {
  parameter: { id: string; label: string; description?: string };
  details?: string[];
}

export const ParameterLabel = ({ parameter, details = [] }: ParameterLabelProps) => {
  const tip = [parameter.description, ...details].filter(Boolean).join(' ');

  return (
    <span>
      {`${parameter.id} · ${parameter.label}`}
      {tip && (
        <>
          {' '}
          <InfoTip content={tip} />
        </>
      )}
    </span>
  );
};
