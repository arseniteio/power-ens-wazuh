import React, { useEffect, useMemo, useState } from 'react';
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
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { PARAMETER_GROUPS } from './parameter-groups';
import { ENSProfile, ENSProfileCondition, ENS_PROFILE_ID_PATTERN, ENS_PROFILE_LAYERS } from '../../../../common/ens/profiles/types';
import { validateProfile } from '../../../../common/ens/profiles/validate';
import { ConditionBuilder, useConditionSuggestions } from './condition-builder';
import { ParameterValueEditor, ENSParameterEdit, emptyValueFor } from './parameter-value-editor';
import { controlTitle } from './parameter-titles';
import { useProfileChanges } from './profile-changes';
import { LAYER_HELP, LAYER_LABELS, hostLabel, machines } from './profile-labels';
import { ENSHostPreview, profilesClient } from './profiles-client';
import { Choice } from '../../ui/choice';
import { InfoTip } from '../../ui/info-tip';
import { OsIcon, osKindOf } from '../groups/os-icon';

interface ProfileEditorProps {
  profileId: string;
  onClose: () => void;
}

type Edits = Record<string, Record<string, ENSParameterEdit>>;

interface Draft {
  id: string;
  name: string;
  description: string;
  layer: string;
  match: ENSProfileCondition[];
  edits: Edits;
}

const NEW = 'nuevo';
const COPY = 'copia:';

const slug = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

const editsOf = (profile: ENSProfile): Edits =>
  Object.fromEntries(
    Object.entries(profile.values || {})
      .filter(([, params]) => Object.keys(params || {}).length > 0)
      .map(([controlId, params]) => [
      controlId,
      Object.fromEntries(
        Object.entries(params || {}).map(([parameterId, value]) => [
          parameterId,
          {
            value,
            ...(profile.match_modes?.[controlId]?.[parameterId] === 'regex' ? { matchMode: 'regex' as const } : {}),
            replace: (profile.replace?.[controlId] || []).includes(parameterId),
          },
        ])
      ),
    ])
  );

const profileOf = (draft: Draft): ENSProfile => {
  const values: ENSProfile['values'] = {};
  const modes: NonNullable<ENSProfile['match_modes']> = {};
  const replace: NonNullable<ENSProfile['replace']> = {};
  Object.entries(draft.edits).forEach(([controlId, params]) =>
    Object.entries(params).forEach(([parameterId, edit]) => {
      (values[controlId] = values[controlId] || {})[parameterId] = edit.value;
      if (edit.matchMode === 'regex') (modes[controlId] = modes[controlId] || {})[parameterId] = 'regex';
      if (edit.replace) replace[controlId] = [...(replace[controlId] || []), parameterId];
    })
  );
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    layer: draft.layer,
    match: draft.match.map(condition => ({ ...condition, value: condition.value.trim() })),
    values,
    ...(Object.keys(modes).length ? { match_modes: modes } : {}),
    ...(Object.keys(replace).length ? { replace } : {}),
  };
};

const draftOf = (profile: ENSProfile): Draft => ({
  id: profile.id,
  name: profile.name,
  description: profile.description || '',
  layer: profile.layer,
  match: (profile.match || []).map(condition => ({ ...condition })),
  edits: editsOf(profile),
});

const usePreview = (match: ENSProfileCondition[]) => {
  const [preview, setPreview] = useState<ENSHostPreview | undefined>();
  const [error, setError] = useState<string | undefined>();
  const key = JSON.stringify(match);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      profilesClient
        .preview(match, controller.signal)
        .then(result => {
          setPreview(result);
          setError(undefined);
        })
        .catch(failure => !controller.signal.aborted && setError(failure?.message || String(failure)));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The serialized conditions are the dependency; the array identity changes on every edit.
  }, [key]);
  return { preview, error };
};

const Section = ({
  number,
  title,
  info,
  aside,
  children,
}: {
  number: number;
  title: string;
  info?: React.ReactNode;
  aside?: string;
  children: React.ReactNode;
}) => (
  <>
    <EuiPanel paddingSize='l' hasBorder>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color='primary'>{number}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size='xs'>
            <h4>{title}</h4>
          </EuiTitle>
        </EuiFlexItem>
        {info && (
          <EuiFlexItem grow={false}>
            <InfoTip content={info} />
          </EuiFlexItem>
        )}
        <EuiFlexItem />
        {aside && (
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              <span>{aside}</span>
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='m' />
      {children}
    </EuiPanel>
    <EuiSpacer size='m' />
  </>
);

export const ProfileEditor = ({ profileId, onClose }: ProfileEditorProps) => {
  const { working, canChange, stageUpsert, stageDeletion, unstage, editorDrafts } = useProfileChanges();
  const suggestions = useConditionSuggestions();

  const copyOf = profileId.startsWith(COPY) ? profileId.slice(COPY.length) : undefined;
  const isNew = profileId === NEW || Boolean(copyOf);
  const existing = working.find(entry => entry.profile.id === (copyOf || profileId) && entry.errors.length === 0) || working.find(entry => entry.profile.id === (copyOf || profileId));

  const initial = useMemo<Draft>(() => {
    if (profileId === NEW) return { id: '', name: '', description: '', layer: 'service', match: [{ field: 'service', op: 'has', value: '' }], edits: {} };
    if (existing && copyOf) {
      const base = draftOf(existing.profile);
      return { ...base, id: slug(`${existing.profile.id}-copia`), name: `Copia de ${existing.profile.name}` };
    }
    return existing ? draftOf(existing.profile) : { id: profileId, name: '', description: '', layer: 'site', match: [], edits: {} };
    // Built once per opened profile; later list refreshes must not overwrite what is being edited.
  }, [profileId]);

  const remembered = editorDrafts.get(profileId) as { draft: Draft; idTouched: boolean } | undefined;
  const [draft, setDraft] = useState<Draft>(remembered?.draft || initial);
  const [idTouched, setIdTouched] = useState(remembered ? remembered.idTouched : !isNew);
  useEffect(() => {
    editorDrafts.set(profileId, { draft, idTouched });
  }, [editorDrafts, profileId, draft, idTouched]);
  const close = () => {
    editorDrafts.delete(profileId);
    onClose();
  };
  const [opened, setOpened] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const { preview, error: previewError } = usePreview(draft.match);

  if (!isNew && !existing) {
    return (
      <EuiCallOut color='warning' iconType='iInCircle' title={`Grupo ${profileId} inexistente`}>
        <EuiButton size='s' onClick={close}>
          Grupos
        </EuiButton>
      </EuiCallOut>
    );
  }

  const readOnly = existing?.staged === 'deleted' && !isNew;
  const profile = profileOf(draft);
  const takenId = isNew && working.some(entry => entry.profile.id === profile.id && entry.staged !== 'deleted');
  const errors = [...(takenId ? [`identificador «${profile.id}» en uso`] : []), ...validateProfile(profile)];
  const changed = JSON.stringify(profile) !== JSON.stringify(profileOf(initial)) || isNew;

  const update = (patch: Partial<Draft>) => setDraft(previous => ({ ...previous, ...patch }));
  const setName = (name: string) => update(idTouched ? { name } : { name, id: slug(name) });
  const setEdit = (controlId: string, parameterId: string, edit: ENSParameterEdit | undefined) =>
    setDraft(previous => {
      const params = { ...(previous.edits[controlId] || {}) };
      if (edit) params[parameterId] = edit;
      else delete params[parameterId];
      const edits = { ...previous.edits, [controlId]: params };
      if (!Object.keys(params).length) delete edits[controlId];
      return { ...previous, edits };
    });

  const addOptions = PARAMETER_GROUPS.map(group => ({
    label: `${group.controlId} · ${controlTitle(group.controlId)}`,
    options: group.parameters
      .filter(parameter => !draft.edits[group.controlId]?.[parameter.parameterId])
      .map(parameter => ({ label: `${parameter.label} (${group.controlId} ${parameter.parameterId})`, value: `${group.controlId}|${parameter.parameterId}|${parameter.type}` })),
  })).filter(group => group.options.length);

  const controls = Object.keys(draft.edits).sort();
  const valueCount = controls.reduce((total, controlId) => total + Object.keys(draft.edits[controlId]).length, 0);

  const stage = () => {
    stageUpsert(profile);
    close();
  };

  const title = isNew ? (copyOf ? `Copia de ${existing?.profile.name || copyOf}` : 'Nuevo grupo') : existing!.profile.name;

  return (
    <>
      <EuiButtonEmpty iconType='arrowLeft' flush='left' size='s' onClick={close}>
        Grupos
      </EuiButtonEmpty>
      <EuiSpacer size='s' />
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size='s'>
            <h3>{title}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {existing?.origin === 'builtin' && !isNew && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='default'>Incluido</EuiBadge>
          </EuiFlexItem>
        )}
        {existing?.origin === 'override' && !isNew && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>Versión propia</EuiBadge>
          </EuiFlexItem>
        )}
        {existing && existing.origin !== 'stored' && !isNew && (
          <EuiFlexItem grow={false}>
            <InfoTip content='Grupo incluido en Power ENS. Al guardarlo editado, la versión propia sustituye a la incluida; al eliminarla, se recupera la incluida.' />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='m' />

      {readOnly && (
        <>
          <EuiCallOut color='danger' iconType='trash' size='s' title='Eliminación pendiente de guardar'>
            <EuiButton size='s' onClick={() => unstage(profileId)}>
              Mantener
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='l' alignItems='flexStart'>
        <EuiFlexItem>
          <Section number={1} title='Identificación'>
            <EuiFlexGroup gutterSize='m'>
              <EuiFlexItem>
                <EuiFormRow label='Nombre' fullWidth>
                  <EuiFieldText fullWidth value={draft.name} readOnly={readOnly} onChange={event => setName(event.target.value)} />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false} style={{ width: 260 }}>
                <EuiFormRow
                  label='Identificador'
                  labelAppend={<InfoTip content='Minúsculas, cifras y guiones. Fijo tras crear el grupo.' />}
                  isInvalid={isNew && Boolean(draft.id) && !ENS_PROFILE_ID_PATTERN.test(draft.id)}
                >
                  <EuiFieldText
                    value={draft.id}
                    readOnly={!isNew}
                    onChange={event => {
                      setIdTouched(true);
                      update({ id: event.target.value.toLowerCase() });
                    }}
                    style={{ fontFamily: 'Roboto Mono, Menlo, monospace' }}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiFormRow label='Descripción' fullWidth labelAppend={<EuiText size='xs' color='subdued'>Opcional</EuiText>}>
              <EuiTextArea fullWidth rows={2} value={draft.description} readOnly={readOnly} onChange={event => update({ description: event.target.value })} />
            </EuiFormRow>
          </Section>

          <Section
            number={2}
            title='Capa'
            info={
              <>
                {ENS_PROFILE_LAYERS.map(layer => (
                  <p key={layer}>
                    <strong>{LAYER_LABELS[layer]}:</strong> {LAYER_HELP[layer]}
                  </p>
                ))}
              </>
            }
          >
            <Choice
              legend='Capa'
              options={ENS_PROFILE_LAYERS.map(layer => ({ value: layer, text: LAYER_LABELS[layer] }))}
              value={draft.layer}
              disabled={readOnly}
              onChange={layer => update({ layer })}
            />
          </Section>

          <Section number={3} title='Condiciones' info='Se exigen todas a la vez. Datos del inventario de Wazuh, recalculados en cada pasada del motor.'>
            <ConditionBuilder match={draft.match} suggestions={suggestions} readOnly={readOnly} onChange={match => update({ match })} />
          </Section>

          <Section
            number={4}
            title='Parámetros'
            info='Parámetros por activo. Los de ámbito organización se editan en Organización.'
            aside={`${valueCount} ${valueCount === 1 ? 'parámetro' : 'parámetros'}`}
          >
            {controls.map(controlId => (
              <React.Fragment key={controlId}>
                <EuiAccordion
                  id={`ens-profile-${controlId}`}
                  buttonContent={
                    <EuiText size='s'>
                      <strong>{controlId}</strong> {controlTitle(controlId)}
                    </EuiText>
                  }
                  extraAction={
                    <EuiBadge color='hollow'>{Object.keys(draft.edits[controlId]).length}</EuiBadge>
                  }
                  initialIsOpen={opened === controlId || controls.length <= 3}
                  paddingSize='s'
                >
                  {Object.keys(draft.edits[controlId])
                    .sort()
                    .map(parameterId => (
                      <ParameterValueEditor
                        key={parameterId}
                        controlId={controlId}
                        parameterId={parameterId}
                        edit={draft.edits[controlId][parameterId]}
                        readOnly={readOnly}
                        onChange={edit => setEdit(controlId, parameterId, edit)}
                        onRemove={() => setEdit(controlId, parameterId, undefined)}
                      />
                    ))}
                </EuiAccordion>
                <EuiHorizontalRule margin='s' />
              </React.Fragment>
            ))}
            {!controls.length && (
              <EuiText size='s' color='subdued'>
                <p>Sin parámetros</p>
              </EuiText>
            )}
            {!readOnly && !adding && (
              <>
                <EuiSpacer size='s' />
                <EuiButton size='s' iconType='plusInCircle' onClick={() => setAdding(true)} isDisabled={!addOptions.length}>
                  Añadir parámetro
                </EuiButton>
              </>
            )}
            {!readOnly && adding && (
              <>
                <EuiSpacer size='s' />
                <EuiFlexGroup gutterSize='s' alignItems='center' justifyContent='spaceBetween' responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size='s'>
                      <strong>Añadir parámetro</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' onClick={() => setAdding(false)}>
                      Cerrar
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <Choice
                  legend='Añadir parámetro'
                  options={addOptions.flatMap(group => group.options.map(option => ({ value: String(option.value), text: option.label })))}
                  value=''
                  onChange={value => {
                    if (!value) return;
                    const [controlId, parameterId, type] = value.split('|');
                    setEdit(controlId, parameterId, { value: emptyValueFor(type), replace: false });
                    setOpened(controlId);
                    setAdding(false);
                  }}
                />
              </>
            )}
          </Section>
        </EuiFlexItem>

        <EuiFlexItem grow={false} style={{ width: 320, position: 'sticky', top: 16 }}>
          <EuiPanel paddingSize='m' hasBorder>
            <EuiTitle size='xs'>
              <h4>Activos incluidos</h4>
            </EuiTitle>
            <EuiSpacer size='s' />
            {previewError && <EuiCallOut size='s' color='danger' iconType='alert' title={previewError} />}
            {!previewError && preview && preview.problems.length === 0 && (
              <>
                <EuiTitle size='l'>
                  <span>{preview.total.toLocaleString('es-ES')}</span>
                </EuiTitle>
                <EuiSpacer size='s' />
                {preview.hosts.map(host => (
                  <React.Fragment key={host.agentId}>
                    <EuiHorizontalRule margin='xs' />
                    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
                      <EuiFlexItem grow={false}>
                        <OsIcon kind={osKindOf(host)} />
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size='s'>
                          <strong>{hostLabel(host)}</strong>
                          <EuiText size='xs' color='subdued'>
                            {[host.agentId, host.distro].filter(Boolean).join(' · ')}
                          </EuiText>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </React.Fragment>
                ))}
                {preview.total > preview.hosts.length && (
                  <EuiText size='xs' color='subdued'>
                    <p>{`+ ${machines(preview.total - preview.hosts.length)}`}</p>
                  </EuiText>
                )}
              </>
            )}
            {!previewError && preview && preview.problems.length > 0 && (
              <EuiText size='s' color='subdued'>
                <p>Condiciones incompletas</p>
              </EuiText>
            )}
            {!previewError && !preview && (
              <EuiText size='s' color='subdued'>
                <p>Calculando…</p>
              </EuiText>
            )}
          </EuiPanel>
          <EuiSpacer size='m' />
          {errors.length > 0 && !readOnly && (
            <>
              <EuiCallOut size='s' color='warning' iconType='alert' title='Pendiente de corregir'>
                <ul>
                  {errors.slice(0, 8).map(message => (
                    <li key={message}>{message.charAt(0).toUpperCase() + message.slice(1)}</li>
                  ))}
                </ul>
              </EuiCallOut>
              <EuiSpacer size='m' />
            </>
          )}
          {!readOnly && (
            <EuiButton fill fullWidth iconType='check' isDisabled={errors.length > 0 || !changed} onClick={stage}>
              Añadir al cambio
            </EuiButton>
          )}
          {!canChange && (
            <>
              <EuiSpacer size='s' />
              <EuiText size='xs' color='subdued'>
                <p>Requiere rol power_ens_admin o all_access</p>
              </EuiText>
            </>
          )}
          {!isNew && !readOnly && existing && existing.origin !== 'builtin' && (
            <>
              <EuiSpacer size='s' />
              <EuiButtonEmpty
                color='danger'
                iconType='trash'
                size='s'
                onClick={() => {
                  if (existing.staged === 'new') unstage(existing.profile.id);
                  else stageDeletion(existing.profile.id);
                  close();
                }}
              >
                {existing.origin === 'override' ? 'Restaurar versión incluida' : 'Eliminar grupo'}
              </EuiButtonEmpty>
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
