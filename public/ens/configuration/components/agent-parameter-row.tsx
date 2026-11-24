import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { ENS_THEME } from '../../theme-colors';

import type {
  ENSAgentParameterValue,
  ENSControlParameter,
  ENSMatchMode,
} from '../../../../common/ens/configuration/types';
import { withMatchMode } from '../../../../common/ens/configuration/services/parameter-pattern';
import { ParameterRendererFactory, parameterAnchorId } from '../form-engine';
import {
  isEmptyParameterValue,
  toParameterListItems,
  toParameterTableRows,
  validateParameterValue,
} from '../../../../common/ens/configuration/services/parameter-value-validator';
import type { ENSResolvedValueOrigin } from '../../../../common/ens/configuration/agents/configuration-resolver';
import { errorMessage } from './confirm-modal';
import { findOrganizationDataLink } from '../../../../common/ens/configuration/organization/organization-data-items';

interface AgentParameterRowProps {
  agentId: string;
  parameter: ENSControlParameter;
  origin: ENSResolvedValueOrigin;
  contributionOnly?: boolean;
  organisationRows?: string[];
  effectiveRows?: string[];
  note?: string;
  applicable: boolean;
  focused: boolean;
  describeSave: (value: ENSAgentParameterValue | undefined, matchMode?: ENSMatchMode) => 'remove' | 'same' | 'propio';
  onSave: (value: ENSAgentParameterValue | undefined, matchMode?: ENSMatchMode) => Promise<void>;
  onDone?: () => void;
}

const describeOrigin = (origin: ENSResolvedValueOrigin, hasValue: boolean, contributionOnly = false): { text: string; color: 'primary' | 'hollow' | 'default' | 'warning' } => {
  if (origin.source === 'agent') return { text: 'Personalizado', color: 'primary' };
  if (origin.source === 'template') return { text: `Plantilla «${origin.templateName || origin.templateId}»`, color: 'hollow' };
  if (contributionOnly) return { text: 'Sin filas propias', color: 'default' };
  if (origin.source === 'union') return { text: 'Por defecto + activos', color: 'hollow' };
  return hasValue ? { text: 'Por defecto', color: 'default' } : { text: 'Sin valor', color: 'warning' };
};

export const valueRows = (
  parameter: Pick<ENSControlParameter, 'type'>,
  value: ENSControlParameter['value'],
  matchMode?: ENSMatchMode
): string[] => {
  if (isEmptyParameterValue(value)) return [];
  if (matchMode === 'regex') return [`Expresión regular: ${String(value)}`];
  if (parameter.type === 'table') return toParameterTableRows(value).filter(row => row.trim());
  if (parameter.type === 'list') return toParameterListItems(value);
  return [String(value)];
};

const Rows = ({ rows }: { rows: string[] }) =>
  rows.length ? (
    <ul style={{ margin: 0 }}>
      {rows.slice(0, 5).map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}
      {rows.length > 5 && <li>{`+${rows.length - 5} más`}</li>}
    </ul>
  ) : (
    <span>—</span>
  );

const HINTS: Record<'remove' | 'same', string> = {
  remove: 'Vacío: se restablece el valor heredado.',
  same: 'Igual al heredado: no se personaliza.',
};

export const AgentParameterRow = ({
  agentId,
  parameter,
  origin,
  contributionOnly = false,
  organisationRows,
  effectiveRows,
  note,
  applicable,
  focused,
  describeSave,
  onSave,
  onDone,
}: AgentParameterRowProps) => {
  const [editing, setEditing] = useState(focused);
  const link = findOrganizationDataLink(parameter.controlId, parameter.id);
  const siblings = link
    ? link.item.views
        .filter(view => !view.where && !view.columns && !(view.controlId === parameter.controlId && view.parameterId === parameter.id))
        .map(view => `${view.controlId} ${view.parameterId}`)
    : [];
  const [draft, setDraft] = useState<ENSControlParameter['value']>(parameter.value);
  const [draftMode, setDraftMode] = useState<ENSMatchMode>(parameter.matchMode === 'regex' ? 'regex' : 'exact');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const anchor = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const rows = valueRows(parameter, parameter.value, parameter.matchMode);
  const own = origin.source === 'agent';
  const valueKey = JSON.stringify([parameter.value ?? null, parameter.matchMode ?? null]);
  const storedMode: ENSMatchMode = parameter.matchMode === 'regex' ? 'regex' : 'exact';
  const resetDraft = () => {
    setDraft(parameter.value);
    setDraftMode(storedMode);
  };

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    if (focused) anchor.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (!editing) resetDraft();
  }, [valueKey]);

  const save = async (value: ENSAgentParameterValue | undefined, matchMode: ENSMatchMode) => {
    if (value !== undefined && !isEmptyParameterValue(value)) {
      const verdict = validateParameterValue(withMatchMode(parameter, matchMode), value);
      if (!verdict.valid) {
        setError(`${parameter.id} · ${parameter.label}: ${String(verdict.reason).replace(/\.$/, '')}.`);
        return;
      }
    }
    const mode = describeSave(value, matchMode);
    setSaving(true);
    setError(undefined);
    try {
      await onSave(value, matchMode);
      if (!mounted.current) return;
      setEditing(false);
      setSaved(mode === 'propio' ? undefined : HINTS[mode]);
      onDone?.();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const mode = editing ? describeSave(draft as ENSAgentParameterValue | undefined, draftMode) : 'propio';

  const originLabel = describeOrigin(origin, rows.length > 0, contributionOnly);
  const help = [
    note,
    link ? `Viene de «${link.item.label}» en Organización.` : '',
    siblings.length ? `Se personaliza solo para ${parameter.controlId} ${parameter.id}.` : '',
  ].filter(Boolean);

  return (
    <div ref={anchor} id={parameterAnchorId(parameter.controlId, parameter.id, agentId)}>
      <EuiPanel paddingSize='s' hasBorder={focused} color={focused ? 'primary' : 'transparent'} style={{ borderBottom: `1px solid ${ENS_THEME.border}` }}>
        <EuiFlexGroup gutterSize='m' alignItems='flexStart' responsive={false}>
          <EuiFlexItem style={{ flexBasis: '32%', flexGrow: 0 }}>
            <EuiText size='s'>
              <span>
                <strong>{parameter.label}</strong>{' '}
                {help.length > 0 && <EuiIconTip type='iInCircle' color='subdued' content={help.join(' ')} />}
              </span>
            </EuiText>
            <EuiText size='xs' color='subdued'>
              <span>
                {parameter.id}
                {parameter.required && applicable ? ' · obligatorio' : ''}
                {!applicable ? ' · no aplica a este nivel' : ''}
              </span>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            {!editing && (
              <EuiText size='xs'>
                <Rows rows={rows} />
                {contributionOnly && organisationRows && organisationRows.length > 0 && (
                  <EuiText size='xs' color='subdued'>
                    <span>{`+ ${organisationRows.length} por defecto`}</span>
                  </EuiText>
                )}
                {effectiveRows && (
                  <EuiText size='xs' color='subdued'>
                    <span>{`Se evalúan ${effectiveRows.length} en total`}</span>
                  </EuiText>
                )}
              </EuiText>
            )}
            {editing && (
              <>
                <ParameterRendererFactory
                  parameter={withMatchMode(parameter, draftMode)}
                  value={draft}
                  onChange={(_name, value) => setDraft(value)}
                  onMatchModeChange={(_name, next) => setDraftMode(next)}
                />
                {mode !== 'propio' && (
                  <EuiText size='xs' color='subdued'>
                    <p>{HINTS[mode]}</p>
                  </EuiText>
                )}
                <EuiSpacer size='s' />
                <EuiFlexGroup gutterSize='s' responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButton size='s' fill isLoading={saving} onClick={() => save(draft as ENSAgentParameterValue | undefined, draftMode)}>
                      Guardar
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' onClick={() => { resetDraft(); setError(undefined); setEditing(false); onDone?.(); }}>
                      Cancelar
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
            {saved && !editing && (
              <EuiText size='xs' color='subdued'>
                <p>{saved}</p>
              </EuiText>
            )}
            {error && (
              <>
                <EuiSpacer size='s' />
                <EuiCallOut color='danger' iconType='alert' size='s' title={error} />
              </>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ width: 170 }}>
            <EuiBadge color={originLabel.color}>{originLabel.text}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ width: 72 }}>
            {!editing && (
              <EuiFlexGroup gutterSize='xs' responsive={false} justifyContent='flexEnd'>
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType='pencil'
                    aria-label={own ? 'Editar' : contributionOnly ? 'Añadir filas de este activo' : 'Personalizar'}
                    title={own ? 'Editar' : contributionOnly ? 'Añadir filas de este activo' : 'Personalizar'}
                    onClick={() => { resetDraft(); setSaved(undefined); setEditing(true); }}
                  />
                </EuiFlexItem>
                {own && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonIcon
                      iconType='editorUndo'
                      color='danger'
                      aria-label='Restablecer'
                      title='Restablecer'
                      isDisabled={saving}
                      onClick={() => save(undefined, 'exact')}
                    />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div>
  );
};
