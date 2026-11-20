import React from 'react';
import { EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { resolveBooleanFieldModel, validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { Choice } from '../../../ui/choice';
import { ParameterLabel } from './parameter-label';

export const BooleanParameterRenderer = ({ parameter, value, onChange }: ENSFormFieldProps) => {
  const model = resolveBooleanFieldModel(value);
  const verdict = validateParameterValue(parameter, value);

  return (
    <EuiFormRow
      label={<ParameterLabel parameter={parameter} />}
      isInvalid={!verdict.valid}
      error={verdict.reason ? [verdict.reason] : undefined}
      fullWidth
    >
      <Choice
        legend={parameter.label}
        options={[
          { value: '', text: 'Sin seleccionar' },
          { value: 'sí', text: 'Sí' },
          { value: 'no', text: 'No' },
        ]}
        value={model}
        onChange={(value: string) => onChange(parameter.name, value === '' ? undefined : value)}
      />
    </EuiFormRow>
  );
};
