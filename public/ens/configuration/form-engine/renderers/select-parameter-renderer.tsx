import React from 'react';
import { EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  resolveSelectFieldModel,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { Choice } from '../../../ui/choice';
import { ParameterLabel } from './parameter-label';


export const SelectParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const model = resolveSelectFieldModel(
    parameter,
    value
  );

  const verdict = validateParameterValue(
    parameter,
    value
  );

  const options = [
    {
      value: '',
      text: 'Sin seleccionar',
    },
    ...model.options.map(option => ({
      value: option.value,
      text: option.label,
    })),
  ];


  return (
    <EuiFormRow
      label={<ParameterLabel parameter={parameter} />}
      helpText={model.legacyValue ? `Valor guardado fuera de las opciones: ${model.legacyValue}` : undefined}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <Choice
        legend={parameter.label || parameter.name}
        options={options}
        value={model.selected}
        onChange={(value: string) => {
          const selected =
            value;

          onChange(
            parameter.name,
            selected === ''
              ? undefined
              : selected
          );
        }}
      />
    </EuiFormRow>
  );
};
