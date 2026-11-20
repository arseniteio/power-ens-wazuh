import React, { useState } from 'react';
import { EuiFieldText, EuiFormRow, EuiSpacer, EuiText } from '@elastic/eui';

import type { ENSMatchMode } from '../../../../../common/agent-configuration';
import type { ENSFormFieldProps } from '../types';
import {
  compileParameterPattern,
  patternFromItems,
} from '../../../../../common/ens/configuration/services/parameter-pattern';
import {
  toParameterListItems,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { ListParameterRenderer } from './list-parameter-renderer';
import { TextParameterRenderer } from './text-parameter-renderer';
import { Choice } from '../../../ui/choice';
import { ParameterLabel } from './parameter-label';

export const PatternParameterRenderer = ({ parameter, value, onChange, onMatchModeChange }: ENSFormFieldProps) => {
  const mode: ENSMatchMode = parameter.matchMode === 'regex' ? 'regex' : 'exact';
  const [sample, setSample] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<ENSMatchMode, ENSFormFieldProps['value']>>>({});
  const verdict = validateParameterValue(parameter, value);
  let matches: boolean | undefined;
  if (mode === 'regex' && sample && verdict.valid) {
    try {
      matches = compileParameterPattern(value).matches(sample);
    } catch {
      matches = undefined;
    }
  }

  const switchMode = (next: ENSMatchMode) => {
    if (next === mode) return;
    setDrafts(previous => ({ ...previous, [mode]: value }));
    let nextValue = drafts[next];
    if (!Object.prototype.hasOwnProperty.call(drafts, next) && next === 'regex') {
      const items = parameter.type === 'list' ? toParameterListItems(value) : typeof value === 'string' && value ? [value] : [];
      nextValue = patternFromItems(items, true);
    }
    onMatchModeChange?.(parameter.name, next);
    onChange(parameter.name, nextValue);
  };

  return (
    <>
      <EuiFormRow label={`Modo de ${parameter.label}`} fullWidth>
        <Choice
          legend={`Modo de ${parameter.label}`}
          options={[
            { value: 'exact', text: 'Texto exacto' },
            { value: 'regex', text: 'Expresión regular' },
          ]}
          value={mode}
          onChange={(value: string) => switchMode(value as ENSMatchMode)}
          disabled={!onMatchModeChange}
        />
      </EuiFormRow>
      <EuiSpacer size='s' />
      {mode === 'regex' ? (
        <>
          <EuiFormRow
            label={<ParameterLabel parameter={parameter} />}
            fullWidth
            helpText='Ej.: ^svc_.*$'
            isInvalid={!verdict.valid}
            error={verdict.reason}
          >
            <EuiFieldText
              fullWidth
              value={typeof value === 'string' ? value : ''}
              placeholder='^svc_.*$'
              isInvalid={!verdict.valid}
              onChange={event => onChange(parameter.name, event.target.value)}
            />
          </EuiFormRow>
          <EuiFormRow label='Probar con un valor' fullWidth>
            <EuiFieldText fullWidth value={sample} onChange={event => setSample(event.target.value)} />
          </EuiFormRow>
          {matches !== undefined && (
            <EuiText size='s' color={matches ? 'success' : 'subdued'}>
              <p>{matches ? 'Coincide con la expresión.' : 'No coincide con la expresión.'}</p>
            </EuiText>
          )}
        </>
      ) : parameter.type === 'list' ? (
        <ListParameterRenderer parameter={parameter} value={value} onChange={onChange} />
      ) : (
        <TextParameterRenderer parameter={parameter} value={value} onChange={onChange} />
      )}
      <EuiSpacer size='m' />
    </>
  );
};
