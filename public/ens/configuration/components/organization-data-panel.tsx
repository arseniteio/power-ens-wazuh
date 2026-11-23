import React, { useEffect, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSControlParameter,
  ENSParameterColumn,
} from '../../../../common/ens/configuration/types';
import {
  getPendingOrganizationMigration,
  saveFromLatestConfiguration,
} from '../../../../common/ens/configuration/services/configuration-state-service';
import {
  ORGANIZATION_SOURCE,
  describeOrganizationData,
  describeOrganizationFills,
  setOrganizationValue,
  summarizeOrganizationMigration,
} from '../../../../common/ens/configuration/organization/organization-data-migration';
import type {
  ENSOrganizationCandidate,
  ENSOrganizationItemState,
} from '../../../../common/ens/configuration/organization/organization-data-migration';
import {
  describeOrganizationDataView,
} from '../../../../common/ens/configuration/organization/organization-data-items';
import {
  describeOrganizationChoice,
  organizationCrossChecks,
  organizationDataParameter,
  organizationValueLines,
  organizationValueWarnings,
  validateOrganizationValue,
} from '../../../../common/ens/configuration/organization/organization-data-form';
import { ParameterRendererFactory } from '../form-engine';
import { useRouterSearch } from '../../../routing/use-router-search';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { TableRows } from '../../ui/table-rows';

interface OrganizationDataPanelProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

const organizationItemAnchorId = (itemId: string): string => `ens-org-${itemId}`.replace(/[^A-Za-z0-9_-]/g, '_');

const MAX_LINES = 8;

const ValueLines = ({ value, columns }: { value?: ENSControlParameter['value']; columns?: ENSParameterColumn[] }) => {
  const lines = organizationValueLines(value);
  if (lines.length && columns?.length) return <TableRows rows={lines} columns={columns} />;
  if (!lines.length) {
    return (
      <EuiText size='s' color='subdued'>
        <p>Sin valor</p>
      </EuiText>
    );
  }
  return (
    <EuiText size='s'>
      <ul>
        {lines.slice(0, MAX_LINES).map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
        {lines.length > MAX_LINES && <li>{`… y ${lines.length - MAX_LINES} más`}</li>}
      </ul>
    </EuiText>
  );
};

const usersOf = (state: ENSOrganizationItemState): string[] =>
  state.views.filter(view => view.parameter).map(view => describeOrganizationDataView(view.view));

const UsedBy = ({ state }: { state: ENSOrganizationItemState }) => {
  const users = usersOf(state);
  return users.length ? (
    <EuiToolTip content={users.join(', ')}>
      <span>{`Usado por ${users.length} ${users.length === 1 ? 'control' : 'controles'}`}</span>
    </EuiToolTip>
  ) : (
    <span>Sin uso</span>
  );
};

const statusBadge = (state: ENSOrganizationItemState) =>
  state.status === 'conflict' ? (
    <EuiBadge color='warning'>Valores distintos</EuiBadge>
  ) : state.status === 'incomplete' ? (
    <EuiBadge color='accent'>Sin valor común</EuiBadge>
  ) : state.status === 'value' ? (
    <EuiBadge color='success'>Con valor</EuiBadge>
  ) : (
    <EuiBadge color='hollow'>Sin valor</EuiBadge>
  );

const candidateSource = (candidate: ENSOrganizationCandidate): string =>
  candidate.from === ORGANIZATION_SOURCE ? 'Valor guardado en Datos de la organización' : `Valor de ${candidate.from}`;

export const OrganizationDataPanel = ({ configuration, onConfigurationSaved }: OrganizationDataPanelProps) => {
  const focusItemId = useRouterSearch().configItem;
  const states = describeOrganizationData(configuration);
  const editable = states.filter(state => state.status !== 'informative');
  const informative = states.filter(state => state.status === 'informative');
  const conflicts = states.filter(state => state.status === 'conflict');
  const incomplete = states.filter(state => state.status === 'incomplete');
  const pending = getPendingOrganizationMigration();
  const pendingSave = pending && (pending.moved.length > 0 || pending.written.length > 0);

  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState<ENSAgentParameterValue | undefined>();
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<{ state: ENSOrganizationItemState; candidate: ENSOrganizationCandidate } | undefined>();

  useEffect(() => {
    if (!focusItemId || typeof document === 'undefined') return;
    document.getElementById(organizationItemAnchorId(focusItemId))?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focusItemId]);

  const save = async (itemId: string, value: ENSAgentParameterValue | undefined, reason: string) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: setOrganizationValue(latest, itemId, value), reason }));
      setEditing(undefined);
      setIssues([]);
      onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const savePending = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: latest, reason: summarizeOrganizationMigration({ ...pending!, conflicts: [], incomplete: [] }) }));
      onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (state: ENSOrganizationItemState) => {
    setEditing(state.item.id);
    setDraft(state.value);
    setIssues([]);
    setError(undefined);
  };

  const saveDraft = (state: ENSOrganizationItemState) => {
    const found = validateOrganizationValue(configuration, state.item, draft);
    if (found.length) {
      setIssues(found.map(issue => `${issue.source}: ${issue.reason}.`));
      return;
    }
    return save(state.item.id, draft, `Datos de la organización: «${state.item.label}» actualizado.`);
  };

  const choice = choosing ? describeOrganizationChoice(configuration, choosing.state.item, choosing.candidate.value) : [];
  const confirmChoice = async (): Promise<string | undefined> => {
    const { state, candidate } = choosing!;
    const source = candidate.from === ORGANIZATION_SOURCE ? 'el valor guardado' : `el valor de ${candidate.from}`;
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setOrganizationValue(latest, state.item.id, candidate.value),
        reason: `Datos de la organización: «${state.item.label}» con ${source}.`,
      }));
      setChoosing(undefined);
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      return errorMessage(failure);
    }
  };

  return (
    <EuiPanel paddingSize='m'>
      {choosing && (
        <ConfirmModal title={`Elegir el valor de «${choosing.state.item.label}»`} confirmLabel='Elegir este valor' onCancel={() => setChoosing(undefined)} onConfirm={confirmChoice}>
          <EuiText size='s'>
            {choice.some(change => change.removed.length) ? (
              <>
                <p>Al elegir este valor, estos parámetros pierden lo que tienen ahora:</p>
                <ul>
                  {choice
                    .filter(change => change.removed.length)
                    .map(change => (
                      <li key={change.parameter}>{`${change.parameter}: se quita ${change.removed.map(line => `«${line}»`).join(', ')}; queda ${change.after.length ? change.after.map(line => `«${line}»`).join(', ') : 'sin valor'}.`}</li>
                    ))}
                </ul>
              </>
            ) : (
              <p>Ningún parámetro pierde nada de lo que tiene ahora.</p>
            )}
            {choice.some(change => !change.removed.length) && (
              <p>{`Toman el valor: ${choice.filter(change => !change.removed.length).map(change => change.parameter).join(', ')}.`}</p>
            )}
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
        </ConfirmModal>
      )}
      <EuiTitle size='s'>
        <h3>Datos de la organización</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>Datos compartidos por varios controles.</p>
      </EuiText>
      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo guardar'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {pendingSave && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Valores de los controles pasados a Datos de la organización'>
            <p>{summarizeOrganizationMigration({ ...pending!, conflicts: [], incomplete: [] })}</p>
            {pending!.filled.length ? (
              <ul>
                {describeOrganizationFills(pending!.filled).map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Ningún control cambia de valor.</p>
            )}
            <p>Se guarda con el próximo cambio.</p>
            <EuiButton size='s' onClick={savePending} isLoading={busy} isDisabled={busy}>
              Guardar ahora
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {incomplete.length > 0 && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Datos sin valor común'>
            <ul>
              {incomplete.map(state => (
                <li key={state.item.id}>{state.notice}</li>
              ))}
            </ul>
            <p>Valores distintos entre controles</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {conflicts.length > 0 && (
        <>
          <EuiCallOut color='warning' iconType='alert' title='Valores distintos entre controles'>
            <p>Valor de la organización pendiente de elegir.</p>
          </EuiCallOut>
          <EuiSpacer size='s' />
          {conflicts.map(state => (
            <EuiPanel key={`conflict-${state.item.id}`} color='warning' paddingSize='s'>
              <EuiTitle size='xxs'>
                <h4>{state.item.label}</h4>
              </EuiTitle>
              {state.reasons.length > 0 && (
                <EuiText size='xs'>
                  <p>{`No se completa solo: ${state.reasons.join('; ')}.`}</p>
                </EuiText>
              )}
              {state.candidates.map(candidate => {
                const refused = validateOrganizationValue(configuration, state.item, candidate.value);
                return (
                <div key={`${state.item.id}-${candidate.from}`}>
                  <EuiSpacer size='s' />
                  <EuiText size='s'>
                    <p>
                      <strong>{candidateSource(candidate)}</strong>
                      {candidate.keeps.length ? ` · Lo mantienen: ${candidate.keeps.join(', ')}` : ''}
                    </p>
                  </EuiText>
                  <ValueLines value={candidate.value} columns={state.item.columns} />
                  {refused.length > 0 && (
                    <EuiText size='xs' color='danger'>
                      <p>{`No se puede elegir tal cual: ${refused.map(issue => `${issue.source}: ${issue.reason}`).join('; ')}. Escribir el valor en «Editar».`}</p>
                    </EuiText>
                  )}
                  <EuiButton
                    size='s'
                    isDisabled={busy || refused.length > 0}
                    onClick={() => setChoosing({ state, candidate })}
                  >
                    Elegir este valor
                  </EuiButton>
                </div>
                );
              })}
              {state.views.some(view => view.parameter && !view.configured) && (
                <EuiText size='xs' color='subdued'>
                  <p>{`Sin valor: ${state.views.filter(view => view.parameter && !view.configured).map(view => view.key).join(', ')}.`}</p>
                </EuiText>
              )}
              {state.unrepresentable.length > 0 && (
                <EuiText size='xs' color='subdued'>
                  <p>{`No cabe en el dato común tal como está: ${state.unrepresentable.join(', ')}. Escribir el valor en «Editar».`}</p>
                </EuiText>
              )}
              <EuiSpacer size='s' />
            </EuiPanel>
          ))}
          <EuiSpacer size='m' />
        </>
      )}

      {editable.map(state => (
        <div key={state.item.id} id={organizationItemAnchorId(state.item.id)}>
          <EuiPanel color={focusItemId === state.item.id ? 'primary' : 'subdued'} paddingSize='m'>
            <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size='xs'>
                  <h4>{state.item.label}</h4>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{statusBadge(state)}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='s' color='subdued'>
              <p>{state.item.description}</p>
              <p>
                <UsedBy state={state} />
              </p>
            </EuiText>
            {[
              ...(state.notice ? [state.notice] : []),
              ...organizationCrossChecks(configuration, state.item.id),
              ...organizationValueWarnings(state.item, editing === state.item.id ? draft : state.value),
            ].map(warning => (
              <EuiText key={warning} size='xs' color='warning'>
                <p>{warning}</p>
              </EuiText>
            ))}
            <EuiSpacer size='s' />

            {editing === state.item.id ? (
              <>
                <ParameterRendererFactory
                  parameter={organizationDataParameter(state.item)}
                  value={draft}
                  onChange={(_name, value) => setDraft(value as ENSAgentParameterValue | undefined)}
                />
                {issues.length > 0 && (
                  <>
                    <EuiSpacer size='s' />
                    <EuiCallOut color='danger' iconType='alert' title='Hay valores que no se pueden guardar'>
                      <ul>
                        {issues.map(issue => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </EuiCallOut>
                  </>
                )}
                <EuiSpacer size='s' />
                <EuiFlexGroup gutterSize='s' responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButton fill size='s' isLoading={busy} isDisabled={busy} onClick={() => saveDraft(state)}>
                      Guardar
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' onClick={() => setEditing(undefined)}>
                      Cancelar
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            ) : (
              <>
                {state.status === 'conflict' && !state.stored ? (
                  <EuiText size='s' color='subdued'>
                    <p>Pendiente</p>
                  </EuiText>
                ) : state.status === 'incomplete' ? (
                  <EuiText size='s' color='subdued'>
                    <p>Sin valor común</p>
                  </EuiText>
                ) : (
                  <ValueLines value={state.value} columns={state.item.columns} />
                )}
                <EuiButton size='s' onClick={() => startEditing(state)}>
                  Editar
                </EuiButton>
              </>
            )}

            {state.item.unmapped.length > 0 && (
              <>
                <EuiSpacer size='s' />
                <EuiAccordion id={`ens-org-unmapped-${state.item.id}`} buttonContent='Parámetros relacionados que siguen en su control' paddingSize='s'>
                  <EuiText size='xs'>
                    <ul>
                      {state.item.unmapped.map(entry => (
                        <li key={`${entry.controlId}-${entry.parameterId}`}>{`${entry.controlId} ${entry.parameterId}: ${entry.reason}`}</li>
                      ))}
                    </ul>
                  </EuiText>
                </EuiAccordion>
              </>
            )}
          </EuiPanel>
          <EuiSpacer size='s' />
        </div>
      ))}

      {informative.map(state => (
        <EuiPanel key={state.item.id} color='transparent' hasBorder paddingSize='m'>
          <EuiTitle size='xs'>
            <h4>{state.item.label}</h4>
          </EuiTitle>
          <EuiText size='s' color='subdued'>
            <p>{state.item.description}</p>
            <ul>
              {state.item.unmapped.map(entry => (
                <li key={`${entry.controlId}-${entry.parameterId}`}>{`${entry.controlId} ${entry.parameterId}: ${entry.reason}`}</li>
              ))}
            </ul>
          </EuiText>
        </EuiPanel>
      ))}
    </EuiPanel>
  );
};

interface OrganizationDataNoticeProps {
  configuration: ENSConfigurationVersion;
  onOpen: () => void;
}

export const OrganizationDataNotice = ({ configuration, onOpen }: OrganizationDataNoticeProps) => {
  const pending = getPendingOrganizationMigration();
  const states = describeOrganizationData(configuration);
  const conflicts = states.filter(state => state.status === 'conflict');
  const incomplete = states.filter(state => state.status === 'incomplete');
  const pendingSave = pending && (pending.moved.length > 0 || pending.written.length > 0);
  if (!pendingSave && !conflicts.length && !incomplete.length) return null;
  return (
    <>
      <EuiCallOut color={conflicts.length ? 'warning' : 'primary'} iconType={conflicts.length ? 'alert' : 'iInCircle'} title='Datos de la organización'>
        {pendingSave && <p>{summarizeOrganizationMigration({ ...pending!, conflicts: [], incomplete: [] })} Se guarda con el próximo cambio.</p>}
        {pendingSave && describeOrganizationFills(pending!.filled).map(line => <p key={line}>{line}</p>)}
        {conflicts.length > 0 && <p>{`Valores distintos entre controles: ${conflicts.map(state => `«${state.item.label}»`).join(', ')}. Cada control sigue con el suyo hasta elegir.`}</p>}
        {incomplete.map(state => <p key={state.item.id}>{state.notice}</p>)}
        <EuiButton size='s' onClick={onOpen}>
          Ver Datos de la organización
        </EuiButton>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  );
};
