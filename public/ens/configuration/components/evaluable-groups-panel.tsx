import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiComboBox,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services';
import { withEvaluableGroups } from '../../../../common/ens/core/scope/evaluable-groups';
import { loadENSAgentInventory } from '../../../agents/load-agent-inventory';
import { scopeModeLabel } from './labels';

interface EvaluableGroupsPanelProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

const toOption = (label: string) => ({ label });

export const EvaluableGroupsPanel = ({ configuration, onConfigurationSaved }: EvaluableGroupsPanelProps) => {
  const scope = configuration.scope;
  const [groups, setGroups] = useState<string[]>(scope.groupIds);
  const [knownGroups, setKnownGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  useEffect(() => setGroups(scope.groupIds), [scope.groupIds]);

  useEffect(() => {
    let alive = true;
    loadENSAgentInventory()
      .then(agents => {
        if (alive) setKnownGroups(Array.from(new Set(agents.flatMap(agent => agent.groups))).sort());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => Array.from(new Set([...knownGroups, ...groups])).map(toOption), [knownGroups, groups]);
  const unchanged = scope.mode === 'group' && JSON.stringify(groups) === JSON.stringify(scope.groupIds);

  const change = (next: string[]) => {
    setGroups(next);
    setSaved(false);
    setSaveError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: withEvaluableGroups(latest, groups),
        reason: `Grupos evaluables: ${groups.join(', ')}.`,
      }));
      setSaved(true);
      onConfigurationSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudieron guardar los grupos evaluables.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EuiPanel paddingSize='m' color='subdued'>
      <EuiTitle size='s'>
        <h3>Grupos evaluables</h3>
      </EuiTitle>
      <EuiSpacer size='s' />
      {scope.mode !== 'group' && (
        <>
          <EuiCallOut size='s' color='warning' iconType='alert' title={`Ahora mismo: ${scopeModeLabel(scope.mode)}`}>
            <p>Al guardar, solo se evaluarán los activos de los grupos indicados.</p>
          </EuiCallOut>
          <EuiSpacer size='s' />
        </>
      )}
      <EuiFormRow label='Grupos de Wazuh'  fullWidth>
        <EuiComboBox
          fullWidth
          aria-label='Grupos evaluables'
          options={options}
          selectedOptions={groups.map(toOption)}
          onChange={selected => change(selected.map(option => option.label))}
          onCreateOption={value => {
            const name = value.trim();
            if (name && !groups.includes(name)) change([...groups, name]);
          }}
        />
      </EuiFormRow>
      <EuiSpacer size='s' />
      {saveError && <EuiCallOut size='s' color='danger' iconType='alert' title={saveError} />}
      {saved && <EuiCallOut size='s' color='success' iconType='check' title='Grupos evaluables guardados.' />}
      {(saveError || saved) && <EuiSpacer size='s' />}
      <EuiButton size='s' fill isLoading={saving} isDisabled={unchanged || groups.length === 0} onClick={save}>
        Guardar grupos
      </EuiButton>
    </EuiPanel>
  );
};
