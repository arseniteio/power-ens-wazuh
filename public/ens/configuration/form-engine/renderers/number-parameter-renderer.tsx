import React from 'react';
import { EuiFieldNumber, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { ParameterLabel } from './parameter-label';

const toFieldValue = (
  value: ENSFormFieldProps['value']
): number | '' => {
  if (typeof value === 'number') {
    return value;
  }

  if (
    typeof value === 'string' &&
    /^-?\d+(?:\.\d+)?$/.test(value.trim())
  ) {
    return Number(value.trim());
  }

  return '';
};

export const NumberParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const verdict = validateParameterValue(
    parameter,
    value
  );

  return (
    <EuiFormRow
      label={<ParameterLabel parameter={parameter} />}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <EuiFieldNumber
        fullWidth
        isInvalid={!verdict.valid}
        min={parameter.minValue}
        max={parameter.maxValue}
        value={toFieldValue(value)}
        placeholder={parameter.example}
        onChange={event => {
          const rawValue = event.target.value;

          onChange(
            parameter.name,
            rawValue.trim() === ''
              ? undefined
              : Number(rawValue)
          );
        }}
      />
    </EuiFormRow>
  );
};
