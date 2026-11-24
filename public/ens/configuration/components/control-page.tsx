import React from 'react';
import { EuiHorizontalRule, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import {
  getParameterClass,
  isAgentLevelParameter,
} from '../../../../common/ens/configuration/agents/parameter-classes';
import { hasTemplateParameters } from '../../../../common/ens/configuration/templates';
import { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { ControlConfigurationResolver } from './control-configuration-resolver';
import { ControlConfigurationReset } from './control-configuration-reset';
import { ControlTemplatesPanel } from './control-templates-panel';
import { ControlAssignmentPanel } from './control-assignment-panel';
import { ENSAgentsData, buildAgentRows } from './use-agents-data';

const commonParameterIds = (control: ENSControlConfiguration): string[] =>
  control.parameters
    .filter(parameter => {
      const parameterClass = getParameterClass(control.controlId, parameter.id);
      return parameterClass === 'organisation' || parameterClass === undefined;
    })
    .map(parameter => parameter.id);

export const commonView = (control: ENSControlConfiguration): ENSControlConfiguration => {
  const ids = commonParameterIds(control);
  return { ...control, parameters: control.parameters.filter(parameter => ids.includes(parameter.id)) };
};

interface ControlPageProps {
  configuration: ENSConfigurationVersion;
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  focusParameterId?: string;
  data: ENSAgentsData;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

export const ControlPage = ({
  configuration,
  control,
  activeLevel,
  focusParameterId,
  data,
  onNavigate,
  onConfigurationSaved,
}: ControlPageProps) => {
  const rows = buildAgentRows(configuration, data);
  const withTemplates = hasTemplateParameters(control.controlId);

  return (
    <>
      <EuiTitle size='s'>
        <h3>Valores por defecto</h3>
      </EuiTitle>
      <EuiSpacer size='s' />
      <ControlConfigurationResolver
        key={`${control.controlId}-${focusParameterId || ''}`}
        control={control}
        activeLevel={activeLevel}
        onConfigurationSaved={onConfigurationSaved}
        parameterIds={commonParameterIds(control)}
        secondaryParameterIds={control.parameters.filter(parameter => isAgentLevelParameter(control.controlId, parameter.id)).map(parameter => parameter.id)}
        secondaryTitle='Parámetros por activo'
        secondaryDescription='Se aplican si ni el activo ni su plantilla los fijan.'
        focusParameterId={focusParameterId}
      />

      <EuiHorizontalRule />

      {withTemplates ? (
        <>
          <ControlTemplatesPanel configuration={configuration} control={control} rows={rows} onConfigurationSaved={onConfigurationSaved} />
          <EuiHorizontalRule />
          <ControlAssignmentPanel
            configuration={configuration}
            controlId={control.controlId}
            rows={rows}
            loading={data.loading}
            activeLevel={activeLevel}
            onNavigate={onNavigate}
            onConfigurationSaved={onConfigurationSaved}
          />
          {data.errors.map(error => (
            <EuiText key={error} size='xs' color='subdued'>
              <p>{error}</p>
            </EuiText>
          ))}
        </>
      ) : null}

      <EuiSpacer size='l' />

      <ControlConfigurationReset control={control} onConfigurationSaved={onConfigurationSaved} />
    </>
  );
};
