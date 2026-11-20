import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useMemo, useState } from 'react';
import { ControlListHeader, ControlRow } from './control-row';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import type { ENSSummaryEvaluationResponse } from '../../../common/ens/evaluation/types';
import { EuiIcon, EuiLink, EuiPage, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { ENSControl } from '../types';
import { ControlDetailENS } from './control-detail';
import { getActiveControlConfiguration, getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { describeNotMeasuredOnAgent } from '../../../common/ens/core/scope/measurement-planes';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { resolveControlLevel } from '../../../common/ens/core/control-level';
import { IncoherentLevelsNotice } from '../configuration/components/incoherent-levels-notice';
import { buildControlListEntries, describeLevelExclusions } from './controls-list-model';
import { statusBadgeColor, statusColor } from '../status-colors';

const statusColorValue = (status: string): string => statusColor(status);

const statusBadge = (status: string): string => statusBadgeColor(status);

export const ControlsENS = () => {
  const { control, agentId } = useRouterSearch();

  const selectedControl: ENSControl | null = ENSControls.find(item => item.id === control) || null;

  const updateUrl = useSetRouterSearch();

   const scopeAgents = useActiveENSScopeAgents();

   const summary = useEnsEvaluation<ENSSummaryEvaluationResponse>({
     include: 'summary',
     agentId,
     enabled: !selectedControl,
   });

   const summaryOf = useMemo(
     () => new Map((summary.data?.controls || []).map(entry => [entry.controlId, entry])),
     [summary.data],
   );

   const agentName = scopeAgents.find(agent => agent.id === agentId)?.name;
   const configuration = getActiveENSConfiguration();
   const globalLevel = configuration.global.ensLevel;
   const [, setRevision] = useState(0);

   const entries = buildControlListEntries(
     ENSControls.map(ensControl => ({
       id: ensControl.id,
       title: ensControl.title,
       activeLevels: ensControl.scope.activeLevels,
     })),
     {
       agentId,
       summaries: summaryOf,
       agentRows: summary.data?.agents,
       isConfigured: id => Boolean(getActiveControlConfiguration(id)),
       notMeasured: id => {
         const catalogControl = getENSCatalogControl(id);
         return catalogControl && agentId
           ? describeNotMeasuredOnAgent(catalogControl, agentId, agentName, getActiveControlConfiguration(id, agentId))
           : undefined;
       },
       levelOf: id => resolveControlLevel(getENSCatalogControl(id) || {}, globalLevel, configuration.global),
     },
   );
   const outOfLevel = describeLevelExclusions(entries, globalLevel, id => resolveControlLevel(getENSCatalogControl(id) || {}, globalLevel, configuration.global));
   const unmeasured = entries.filter(entry => !entry.measured).length;

  if (selectedControl) {
    return (
      <ControlDetailENS
        control={selectedControl}
        agentId={agentId}
        onBack={() => updateUrl({ control: undefined })}
      />
    );
  }

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiTitle size='m'>
          <h2>Controles</h2>
        </EuiTitle>
        <EuiSpacer size='s' />
        <IncoherentLevelsNotice global={configuration.global} />
        {summary.error ? (
          <>
            <FactsReadErrorCallOut error={summary.error} onRetry={summary.retry} />
            <EuiSpacer size='m' />
          </>
        ) : (
          <EvaluationStatusLine meta={summary.data?.meta} refreshing={summary.isRefreshing} onRetry={summary.retry} />
        )}
        {outOfLevel && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                <EuiIcon type='iInCircle' /> {outOfLevel.text}: sin requisitos en este nivel.{' '}
                <EuiLink onClick={() => updateUrl({ tabView: 'configuration', configView: 'general', configAgent: undefined, configControl: undefined, configParam: undefined })}>
                  Categoría del sistema
                </EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        {agentId && unmeasured > 0 && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                {`Controles sin medición en ${agentName || agentId}: ${unmeasured}`}{' '}
                <EuiLink onClick={() => updateUrl({ agentId: undefined })}>Todas las máquinas</EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        <EuiSpacer size='m' />
        <ControlListHeader />
        <div>
          {entries.map(entry => (
            <ControlRow
              key={entry.id}
              entry={entry}
              isLoading={summary.isLoading}
              error={summary.error}
              statusColor={statusColorValue}
              statusBadge={statusBadge}
              onSelect={() => updateUrl({ control: entry.id })}
              onConfigurationChanged={() => {
                setRevision(n => n + 1);
                summary.retry();
              }}
            />
          ))}
        </div>
      </EuiPanel>
    </EuiPage>
  );
};
