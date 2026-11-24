import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { ENS_OUT_OF_GROUP_LABEL } from '../../../../common/ens/core/scope/evaluable-groups';
import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSLevel,
  ENSMatchMode,
  ENSSystemType,
} from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPES, ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { getControlTemplates, getTypeDefaultTemplate } from '../../../../common/ens/configuration/templates';
import {
  ENS_MANAGER_AGENT,
  getAgentLevelValue,
  getAgentSystemType,
  getEffectiveTemplate,
  isUnionParameter,
  resolveControlConfigurationWithOrigins,
} from '../../../../common/ens/configuration/agents/configuration-resolver';
import { getParameterClass } from '../../../../common/ens/configuration/agents/parameter-classes';
import { effectiveSystemType } from '../../../../common/ens/configuration/agents/system-detection';
import {
  ENSAgentChangePreview,
  ENSAssignmentPreview,
  clearAgentControlOverrides,
  describeAgentEntryRemoval,
  describeAgentValueSave,
  describeTemplateChoice,
  getAgentCompleteness,
  previewConfigurationChange,
  previewControlAssignment,
  removeAgentEntry,
  setAgentAliases,
  setAgentParameterValue,
  setAgentTypeOverride,
  setControlTemplateAssignment,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getAgentControls } from '../../../../common/ens/configuration/agents/agent-controls';
import { validateAgentProfile } from '../../../../common/ens/configuration/agents/agent-configuration-validator';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';

import { AgentParameterRow, valueRows } from './agent-parameter-row';
import { ChangePreviewModal } from './change-preview-modal';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { ENSEntryRemoval, RemoveEntryModal } from './remove-entry-modal';
import { agentTypeLabel } from './labels';
import { ENSAgentRow, agentRowLabel } from './use-agents-data';
import { Choice } from '../../ui/choice';

interface AgentConfigurationPageProps {
  configuration: ENSConfigurationVersion;
  row: ENSAgentRow;
  known: boolean;
  loading: boolean;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

const isContribution = (controlId: string, parameterId: string): boolean => isUnionParameter(controlId, parameterId);

const BY_TYPE = '__type';

interface PendingChange {
  title: string;
  confirmLabel: string;
  intro: string;
  previews: (ENSAgentChangePreview & Partial<ENSAssignmentPreview>)[];
  build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion;
  reason: string;
}

export const AgentConfigurationPage = ({
  configuration,
  row,
  known,
  loading,
  target,
  getActiveLevel,
  onNavigate,
  onConfigurationSaved,
}: AgentConfigurationPageProps) => {
  const agentId = row.id;
  const profile = configuration.agents?.[agentId];
  const effective = effectiveSystemType(row.detection, profile);
  const storedType = getAgentSystemType(profile);
  const controls = getAgentControls(configuration, agentId, effective.type, getActiveLevel);
  const completeness = getAgentCompleteness(
    configuration,
    agentId,
    controls.filter(control => control.measured).map(control => ({ controlId: control.controlId, level: control.level }))
  );
  const issues = profile ? validateAgentProfile(agentId, profile, configuration) : [];
  const orphans = issues.filter(issue => issue.kind === 'orphan');
  const otherIssues = issues.filter(issue => issue.kind !== 'orphan' && issue.severity === 'error');
  const typeLabel = agentTypeLabel(profile, row.detection, loading);

  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingChange | undefined>();
  const [clearing, setClearing] = useState<string | undefined>();
  const [entryRemoval, setEntryRemoval] = useState<ENSEntryRemoval | undefined>();
  const [aliasesText, setAliasesText] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const label = agentRowLabel(row);
  const aliasesValue = aliasesText ?? (profile?.aliases || []).join(', ');

  const save = async (
    build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion,
    reason: string
  ): Promise<string | undefined> => {
    setSaving(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: build(latest), reason }));
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      const text = errorMessage(failure);
      setError(text);
      return text;
    } finally {
      setSaving(false);
    }
  };

  const saveWithPreview = (change: Omit<PendingChange, 'previews'>, previews?: PendingChange['previews']) => {
    const shown = previews || previewConfigurationChange(configuration, change.build(configuration), [agentId]);
    if (shown.every(item => !item.changes.length)) {
      save(change.build, change.reason);
      return;
    }
    setPending({ ...change, previews: shown });
  };

  const confirmPending = async () => {
    if (!pending) return undefined;
    const failure = await save(pending.build, pending.reason);
    if (!failure) setPending(undefined);
    return failure;
  };

  const changeType = (type: ENSSystemType | typeof ENS_NO_TEMPLATE | undefined) =>
    saveWithPreview({
      title: `Cambiar el tipo de ${label}`,
      confirmLabel: 'Cambiar el tipo',
      intro: 'Controles sin plantilla asignada: plantilla del tipo nuevo.',
      build: latest => setAgentTypeOverride(latest, agentId, type, row.agent),
      reason:
        type === ENS_NO_TEMPLATE
          ? `${label}: sin plantilla.`
          : type
          ? `Tipo de ${label} corregido a mano: ${ENS_SYSTEM_TYPE_LABELS[type]}.`
          : `Tipo de ${label}: vuelve al detectado.`,
    });

  const assign = (controlId: string, choice: string) => {
    const templateId = choice === BY_TYPE ? undefined : choice;
    try {
      const { previews } = previewControlAssignment(configuration, controlId, [agentId], templateId);
      saveWithPreview(
        {
          title: `${controlId}: plantilla ${describeTemplateChoice(configuration, controlId, templateId)} para ${label}`,
          confirmLabel: 'Asignar',
          intro: 'Valores propios conservados.',
          build: latest => setControlTemplateAssignment(latest, controlId, [agentId], templateId, { [agentId]: row.agent }),
          reason: `${controlId}: plantilla ${describeTemplateChoice(configuration, controlId, templateId)} para ${label}.`,
        },
        previews
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const removeOrphan = (controlId?: string, parameterId?: string) =>
    save(
      latest => removeAgentEntry(latest, agentId, controlId, parameterId),
      `Quitado de ${label} un ajuste que no se aplicaba (${controlId || ''}${parameterId ? ` ${parameterId}` : ''}).`
    );

  const confirmEntryRemoval = async () => {
    if (!entryRemoval) return undefined;
    const failure = await removeOrphan(entryRemoval.controlId);
    if (!failure) setEntryRemoval(undefined);
    return failure;
  };

  const confirmClear = async () => {
    if (!clearing) return undefined;
    const controlId = clearing;
    const failure = await save(latest => clearAgentControlOverrides(latest, agentId, controlId), `${controlId}: ${label} sin ajustes propios.`);
    if (!failure) setClearing(undefined);
    return failure;
  };

  const saveParameter = async (controlId: string, parameterId: string, value: ENSAgentParameterValue | undefined, matchMode?: ENSMatchMode) => {
    const mode = describeAgentValueSave(configuration, agentId, controlId, parameterId, value, matchMode);
    const failure = await save(
      latest => setAgentParameterValue(latest, agentId, controlId, parameterId, value, row.agent, matchMode),
      mode === 'propio' ? `${controlId} ${parameterId}: valor personalizado en ${label}.` : `${controlId} ${parameterId}: ${label} restablecido.`
    );
    if (failure) throw new Error(failure);
  };

  const typeOptions = [
    {
      value: '',
      text: storedType && !profile?.typeOverride
        ? `Detectado automáticamente: ${ENS_SYSTEM_TYPE_LABELS[storedType]}`
        : row.detection.type
        ? `Detectado automáticamente: ${ENS_SYSTEM_TYPE_LABELS[row.detection.type]} (sin guardar)`
        : 'Sin detectar (elegir uno)',
    },
    ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: ENS_SYSTEM_TYPE_LABELS[type] })),
    { value: ENS_NO_TEMPLATE, text: 'Sin plantilla' },
  ];

  return (
    <>
      <EuiText size='s' color='subdued'>
        <p>
          {[
            row.inScope ? 'En un grupo evaluable' : ENS_OUT_OF_GROUP_LABEL,
            row.agent.os?.name ? `${row.agent.os.name}${row.agent.os.version ? ` ${row.agent.os.version}` : ''}` : '',
            `${completeness.withValue} de ${completeness.total} parámetros con valor`,
            completeness.ownValues ? `${completeness.ownValues} personalizados` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          {loading && <> · <EuiLoadingSpinner size='s' /></>}
        </p>
      </EuiText>

      {!known && !profile && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut color='warning' iconType='alert' size='s' title={`El activo ${agentId} no existe en el inventario`} />
        </>
      )}

      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo guardar'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {orphans.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' size='s' title='Ajustes sin uso'>
            <ul>
              {orphans.map((issue, index) => (
                <li key={`${index}-${issue.controlId}-${issue.parameterId}`}>
                  {issue.message}{' '}
                  <EuiButtonEmpty
                    size='xs'
                    color='danger'
                    isDisabled={saving}
                    onClick={() =>
                      issue.parameterId
                        ? removeOrphan(issue.controlId, issue.parameterId)
                        : setEntryRemoval({ agentKey: agentId, controlId: issue.controlId })
                    }
                  >
                    Quitar
                  </EuiButtonEmpty>
                </li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {otherIssues.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' size='s' title='Ajustes que corregir'>
            <ul>{otherIssues.map((issue, index) => <li key={`${index}-${issue.message}`}>{issue.message}</li>)}</ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Tipo de sistema' helpText={loading && !effective.manual ? 'Detectando…' : effective.description}>
            <Choice
              legend='Tipo de sistema'
              options={typeOptions}
              value={profile?.typeOverride || ''}
              onChange={(value: string) => changeType((value || undefined) as ENSSystemType | typeof ENS_NO_TEMPLATE | undefined)}
              disabled={saving}
            />
          </EuiFormRow>
        </EuiFlexItem>

        <EuiFlexItem style={{ minWidth: 320 }}>
          <EuiFormRow label='Otros nombres' helpText='Separados por comas.'>
            <EuiFieldText
              value={aliasesValue}
              disabled={saving}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAliasesText(event.target.value)}
            />
          </EuiFormRow>
          <EuiButton
            size='s'
            isDisabled={saving || aliasesText === undefined}
            onClick={async () => {
              const aliases = (aliasesText || '').split(',').map(alias => alias.trim()).filter(Boolean);
              const failure = await save(
                latest => setAgentAliases(latest, agentId, aliases, row.agent),
                `Otros nombres de ${label}: ${aliases.join(', ') || 'ninguno'}.`
              );
              if (!failure) setAliasesText(undefined);
            }}
          >
            Guardar
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {pending && (
        <ChangePreviewModal
          title={pending.title}
          confirmLabel={pending.confirmLabel}
          intro={pending.intro}
          configuration={configuration}
          agentLabels={{ [agentId]: label }}
          previews={pending.previews}
          onCancel={() => setPending(undefined)}
          onConfirm={confirmPending}
        />
      )}

      {entryRemoval && (
        <RemoveEntryModal
          configuration={configuration}
          removal={entryRemoval}
          onCancel={() => setEntryRemoval(undefined)}
          onConfirm={confirmEntryRemoval}
        />
      )}

      {clearing && (
        <ConfirmModal
          title={`Restablecer los valores de ${label} en ${clearing}`}
          confirmLabel='Quitar'
          danger
          onCancel={() => setClearing(undefined)}
          onConfirm={confirmClear}
        >
          <EuiText size='s'>
            <p>Vuelven a tomar el valor de su plantilla:</p>
            <ul>
              {describeAgentEntryRemoval(configuration, agentId, clearing, undefined, { overridesOnly: true }).map(line => <li key={line}>{line}</li>)}
            </ul>
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
        </ConfirmModal>
      )}

      <EuiSpacer size='l' />

      <EuiTitle size='s'>
        <h3>Controles</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      {controls.map(control => {
        const resolved = resolveControlConfigurationWithOrigins(configuration, control.controlId, agentId);
        if (!resolved) return null;
        const common = configuration.controls.find(item => item.controlId === control.controlId);
        const parameters = resolved.configuration.parameters.filter(parameter => {
          const parameterClass = getParameterClass(control.controlId, parameter.id);
          return parameterClass === 'system' || parameterClass === 'platform';
        });
        const own = Object.keys(profile?.controls?.[control.controlId]?.parameters || {}).length;
        const open = target.controlId === control.controlId;
        const templates = getControlTemplates(configuration, control.controlId);
        const current = getEffectiveTemplate(configuration, agentId, control.controlId);
        const assigned = current.assignedId;
        const value = choices[control.controlId] ?? (assigned === undefined ? BY_TYPE : assigned);
        const typeDefault = getTypeDefaultTemplate(control.controlId, storedType);
        const templateLabel = current.template
          ? `${current.template.name}${current.via === 'type' ? ' (de serie)' : ''}`
          : assigned === undefined && !typeLabel.stored
          ? 'valores por defecto'
          : 'sin plantilla';

        return (
          <React.Fragment key={control.controlId}>
            <EuiAccordion
              id={`ens-agent-${agentId}-${control.controlId}`}
              initialIsOpen={open}
              buttonContent={
                <span>
                  <strong>{control.controlId}</strong> · {control.controlName}{' '}
                  <EuiBadge color='hollow'>{templateLabel}</EuiBadge>
                  {own > 0 && <EuiBadge color='primary'>{own} personalizado(s)</EuiBadge>}
                  {!control.measured && <EuiBadge color='default'>{control.reason}</EuiBadge>}
                </span>
              }
              paddingSize='m'
            >
              <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiFormRow label='Plantilla' display='rowCompressed'>
                    <Choice
                      legend='Plantilla'
                      options={[
                        { value: BY_TYPE, text: `Detectado automáticamente${!typeLabel.stored ? (typeLabel.pending ? ' (tipo sin guardar)' : ' (sin tipo)') : typeDefault ? ` («${typeDefault.name}»)` : ' (ninguna para su tipo)'}` },
                        ...templates.map(template => ({
                          value: template.id,
                          text: `${template.name}${template.builtin ? ' (de serie)' : ''}`,
                        })),
                        { value: ENS_NO_TEMPLATE, text: 'Sin plantilla (valores por defecto)' },
                        ...(assigned && assigned !== ENS_NO_TEMPLATE && !templates.some(template => template.id === assigned)
                          ? [{ value: assigned, text: `«${assigned}» (no existe)` }]
                          : []),
                      ]}
                      value={value}
                      onChange={(value: string) => setChoices(previous => ({ ...previous, [control.controlId]: value }))}
                      disabled={saving}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size='s'
                    fill
                    isDisabled={saving || value === (assigned === undefined ? BY_TYPE : assigned)}
                    onClick={() => assign(control.controlId, value)}
                  >
                    Asignar
                  </EuiButton>
                </EuiFlexItem>
                {own > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' color='danger' isDisabled={saving} onClick={() => setClearing(control.controlId)}>
                      Restablecer todo
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiSpacer size='s' />

              {parameters.map(parameter => {
                const contribution = isContribution(control.controlId, parameter.id);
                const agentLevel = contribution ? getAgentLevelValue(configuration, agentId, control.controlId, parameter.id) : undefined;
                const shown = contribution ? { ...parameter, value: agentLevel?.value } : parameter;
                const origin = contribution
                  ? agentLevel?.origin || { source: 'organisation' as const }
                  : resolved.origins[parameter.id] || { source: 'organisation' as const };
                const commonValue = common?.parameters.find(item => item.id === parameter.id)?.value;
                const union = isUnionParameter(control.controlId, parameter.id, agentId);
                return (
                  <AgentParameterRow
                    key={parameter.id}
                    agentId={agentId}
                    parameter={shown}
                    origin={origin}
                    contributionOnly={contribution}
                    organisationRows={contribution ? valueRows(parameter, commonValue) : undefined}
                    effectiveRows={union && (agentId === ENS_MANAGER_AGENT || control.controlId === 'mp.info.6') ? valueRows(parameter, parameter.value) : undefined}
                    note={contribution ? 'Solo las filas de este activo; se suman a las comunes.' : undefined}
                    applicable={parameter.levels.includes(control.level)}
                    focused={open && target.parameterId === parameter.id}
                    describeSave={(next, matchMode) => describeAgentValueSave(configuration, agentId, control.controlId, parameter.id, next, matchMode)}
                    onSave={(next, matchMode) => saveParameter(control.controlId, parameter.id, next, matchMode)}
                    onDone={
                      open && target.parameterId === parameter.id
                        ? () => onNavigate({ view: 'agents', agentId, controlId: control.controlId })
                        : undefined
                    }
                  />
                );
              })}
            </EuiAccordion>
            <EuiSpacer size='s' />
          </React.Fragment>
        );
      })}

      {target.controlId && !controls.some(control => control.controlId === target.controlId) && (
        <EuiCallOut color='warning' iconType='iInCircle' size='s' title={`${target.controlId} no tiene parámetros por activo`}>
          <EuiButtonEmpty size='xs' onClick={() => onNavigate({ view: 'controls', controlId: target.controlId, parameterId: target.parameterId })}>
            Abrir en Organización
          </EuiButtonEmpty>
        </EuiCallOut>
      )}
    </>
  );
};
