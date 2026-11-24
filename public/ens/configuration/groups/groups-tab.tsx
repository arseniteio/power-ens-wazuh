import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiDescriptionList,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { handPickedHosts, isHandPicked, loadTemplate, withoutHosts } from '../../../../common/ens/profiles/groups';
import type { ENSProfile } from '../../../../common/ens/profiles/types';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { NO_PROFILE_FILTER } from '../profiles/machine-filters';
import { PARAMETER_GROUPS, ENSParameterGroup } from '../profiles/parameter-groups';
import { controlTitle } from '../profiles/parameter-titles';
import { ENSWorkingProfile, useProfileChanges } from '../profiles/profile-changes';
import { ProfileEditor } from '../profiles/profile-editor';
import { ExportModal } from '../profiles/export-modal';
import { ImportModal } from '../profiles/import-modal';
import { NewProfileModal } from '../profiles/new-profile-modal';
import { hostLabel, layerLabel, matchText } from '../profiles/profile-labels';
import { ENSHostPage, ENSHostRow, profilesClient } from '../profiles/profiles-client';
import type { ENSHostSummaryState } from '../profiles/use-host-summary';
import { AddToGroupModal, BulkValueModal, TypeTemplateModal, hostnameOf } from './bulk-actions';
import { GroupControlFlyout } from './group-control-flyout';
import { MachineDetail } from './machine-detail';
import { OsIcon, osKindOf } from './os-icon';

const NO_GROUP = NO_PROFILE_FILTER;
const PAGE_SIZE = 25;

interface GroupsTabProps {
  target: ENSConfigurationTarget;
  summary: ENSHostSummaryState;
  revision: string;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

const machinesText = (count: number): string => (count === 1 ? '1 máquina' : `${count} máquinas`);

const groupStatus = (profile: ENSProfile): { text: string; color: string } => {
  const set = Object.values(profile.values || {}).reduce((total, params) => total + Object.keys(params || {}).length, 0);
  return set ? { text: set === 1 ? '1 valor' : `${set} valores`, color: 'hollow' } : { text: 'Sin valores', color: 'warning' };
};

const GroupList = ({
  groups,
  counts,
  withoutGroup,
  selected,
  onSelect,
  onCreate,
  onExport,
}: {
  groups: ENSWorkingProfile[];
  counts: Record<string, number>;
  withoutGroup: number;
  selected: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onExport: () => void;
}) => (
  <EuiPanel hasBorder paddingSize='m'>
    <EuiFlexGroup justifyContent='spaceBetween' alignItems='center' responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size='xs'>
          <h3>Grupos</h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize='xs' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' iconType='plusInCircle' onClick={onCreate}>
              Nuevo
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' iconType='exportAction' onClick={onExport}>
              Exportar
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size='s' />
    {groups.map(entry => {
      const status = groupStatus(entry.profile);
      const active = entry.profile.id === selected;
      return (
        <React.Fragment key={entry.profile.id}>
          <EuiPanel
            hasBorder
            paddingSize='s'
            color={active ? 'primary' : 'plain'}
            onClick={() => onSelect(entry.profile.id)}
            aria-label={`Abrir el grupo ${entry.profile.name}`}
          >
            <EuiFlexGroup justifyContent='spaceBetween' gutterSize='s' responsive={false}>
              <EuiFlexItem>
                <EuiText size='s'>
                  <strong>{entry.profile.name}</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size='xs' color='subdued'>
                  {machinesText(counts[entry.profile.id] || 0)}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='xs' color='subdued'>
              {isHandPicked(entry.profile) ? 'Elegidas a mano' : layerLabel(entry.profile.layer)}
              {entry.staged ? ' · sin guardar' : ''}
            </EuiText>
            <EuiBadge color={status.color}>{status.text}</EuiBadge>
          </EuiPanel>
          <EuiSpacer size='xs' />
        </React.Fragment>
      );
    })}
    <EuiPanel hasBorder paddingSize='s' color={selected === NO_GROUP ? 'primary' : 'plain'} onClick={() => onSelect(NO_GROUP)} aria-label='Abrir las máquinas sin grupo'>
      <EuiFlexGroup justifyContent='spaceBetween' gutterSize='s' responsive={false}>
        <EuiFlexItem>
          <EuiText size='s'>
            <strong>Sin grupo</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size='xs' color='subdued'>
            {machinesText(withoutGroup)}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size='xs' color='subdued'>
        Sin grupo asignado
      </EuiText>
    </EuiPanel>
  </EuiPanel>
);

const TemplateModal = ({
  templates,
  group,
  onLoad,
  onClose,
}: {
  templates: ENSProfile[];
  group: ENSProfile;
  onLoad: (template: ENSProfile) => void;
  onClose: () => void;
}) => {
  const [choice, setChoice] = useState(templates[0]?.id);
  return (
    <EuiModal onClose={onClose} style={{ width: 560 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>{`Cargar una plantilla en «${group.name}»`}</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiSpacer size='m' />
        {templates.map(template => (
          <React.Fragment key={template.id}>
            <EuiPanel hasBorder paddingSize='s' color={choice === template.id ? 'primary' : 'plain'} onClick={() => setChoice(template.id)} aria-label={`Elegir ${template.name}`}>
              <EuiText size='s'>
                <strong>{template.name}</strong>
              </EuiText>
              <EuiText size='xs' color='subdued'>
                {`${Object.keys(template.values || {}).length} controles con valores${template.description ? ` · ${template.description}` : ''}`}
              </EuiText>
            </EuiPanel>
            <EuiSpacer size='xs' />
          </React.Fragment>
        ))}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton
          fill
          isDisabled={!choice}
          onClick={() => {
            const template = templates.find(item => item.id === choice);
            if (template) onLoad(template);
            onClose();
          }}
        >
          Cargar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

const useGroupMachines = (groupId: string, text: string, page: number, revision: string) => {
  const [result, setResult] = useState<ENSHostPage | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    profilesClient
      .searchHosts({ page, size: PAGE_SIZE, text, filters: { profile: groupId } }, controller.signal)
      .then(next => {
        setResult(next);
        setError(undefined);
      })
      .catch(failure => !controller.signal.aborted && setError(failure?.message || String(failure)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [groupId, text, page, revision]);
  return { result, loading, error };
};

const GroupMachines = ({
  groupId,
  group,
  groups,
  revision,
  onOpen,
  onStage,
  onConfigurationSaved,
}: {
  groupId: string;
  group?: ENSProfile;
  groups: ENSProfile[];
  revision: string;
  onOpen: (agentId: string) => void;
  onStage: (profile: ENSProfile) => void;
  onConfigurationSaved: () => void;
}) => {
  const [text, setText] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ENSHostRow[]>([]);
  const [action, setAction] = useState<'group' | 'template' | 'value' | undefined>();
  const [saved, setSaved] = useState(0);
  const { result, loading, error } = useGroupMachines(groupId, text, page, `${revision}-${saved}`);

  useEffect(() => setSelected([]), [groupId]);

  const done = () => {
    setSelected([]);
    setSaved(count => count + 1);
    onConfigurationSaved();
  };

  const columns: Array<EuiBasicTableColumn<ENSHostRow>> = [
    {
      field: 'name',
      name: 'Máquina',
      render: (_name: string, host: ENSHostRow) => (
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <OsIcon kind={osKindOf(host)} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiLink onClick={() => onOpen(host.agentId)}>{hostLabel(host)}</EuiLink>
            <EuiText size='xs' color='subdued'>
              {host.agentId}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    { field: 'distro', name: 'Sistema', render: (distro: string, host: ENSHostRow) => distro || host.os?.name || '—' },
    {
      field: 'profiles',
      name: 'Otros grupos',
      render: (profiles: ENSHostRow['profiles']) =>
        profiles.filter(profile => profile.id !== groupId).map(profile => profile.name).join(', ') || '—',
    },
    {
      name: '',
      width: '110px',
      render: (host: ENSHostRow) => (
        <EuiButton size='s' onClick={() => onOpen(host.agentId)}>
          Abrir
        </EuiButton>
      ),
    },
  ];

  return (
    <>
      <EuiFieldSearch fullWidth placeholder='Nombre, grupo, sistema o servicio' value={text} onChange={event => (setText(event.target.value), setPage(0))} />
      <EuiSpacer size='s' />
      {selected.length > 0 && (
        <>
          <EuiPanel color='primary' paddingSize='s'>
            <EuiFlexGroup gutterSize='s' alignItems='center' wrap responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size='s'>
                  <strong>{`${selected.length} seleccionadas`}</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' onClick={() => setAction('group')}>
                  Añadir a grupo
                </EuiButton>
              </EuiFlexItem>
              {group && isHandPicked(group) && (
                <EuiFlexItem grow={false}>
                  <EuiButton size='s' onClick={() => (onStage(withoutHosts(group, selected.map(hostnameOf))), setSelected([]))}>
                    Sacar del grupo
                  </EuiButton>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiButton size='s' onClick={() => setAction('template')}>
                  Plantilla
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' onClick={() => setAction('value')}>
                  Fijar valor
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size='s' />
        </>
      )}
      {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      <EuiBasicTable<ENSHostRow>
        items={result?.hosts || []}
        itemId='agentId'
        columns={columns}
        loading={loading}
        isSelectable
        selection={{ onSelectionChange: setSelected }}
        noItemsMessage={loading ? 'Cargando máquinas…' : 'Sin máquinas'}
        pagination={{ pageIndex: page, pageSize: PAGE_SIZE, totalItemCount: Math.min(result?.total || 0, 10000), hidePerPageOptions: true }}
        onChange={({ page: next }: any) => next && setPage(next.index)}
      />
      {action === 'group' && <AddToGroupModal hosts={selected} groups={groups} onStage={profile => (onStage(profile), setSelected([]))} onClose={() => setAction(undefined)} />}
      {action === 'template' && <TypeTemplateModal hosts={selected} onSaved={done} onClose={() => setAction(undefined)} />}
      {action === 'value' && <BulkValueModal hosts={selected} onSaved={done} onClose={() => setAction(undefined)} />}
    </>
  );
};

const GroupControls = ({ group, onOpen }: { group: ENSProfile; onOpen: (control: ENSParameterGroup) => void }) => (
  <>
    {PARAMETER_GROUPS.map(control => {
      const set = Object.keys(group.values?.[control.controlId] || {}).length;
      return (
        <EuiFlexGroup key={control.controlId} alignItems='center' gutterSize='m' responsive={false} style={{ borderBottom: '1px solid #eef1f5', padding: '6px 0' }}>
          <EuiFlexItem grow={false} style={{ width: 90 }}>
            <EuiText size='s'>
              <code>{control.controlId}</code>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size='s'>{controlTitle(control.controlId)}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color={set ? 'primary' : 'hollow'}>{set ? `${set} de ${control.parameters.length} con valor` : 'Sin valores'}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size='s' onClick={() => onOpen(control)}>
              Configurar
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    })}
  </>
);

export const GroupsTab = ({ target, summary, revision, onNavigate, onConfigurationSaved }: GroupsTabProps) => {
  const { working, loading, loadError, canChange, stageUpsert } = useProfileChanges();
  const [view, setView] = useState<'controls' | 'machines'>('controls');
  const [control, setControl] = useState<ENSParameterGroup | undefined>();
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [dialog, setDialog] = useState<'new' | 'import' | 'export' | undefined>();

  const groups = useMemo(() => working.filter(entry => entry.staged !== 'deleted' && entry.errors.length === 0), [working]);
  const counts = useMemo(() => Object.fromEntries((summary.data?.profiles || []).map(entry => [entry.id, entry.count])), [summary.data]);
  const templates = useMemo(() => working.filter(entry => entry.origin === 'builtin').map(entry => entry.profile), [working]);

  const selectedId = target.profileId || groups[0]?.profile.id || NO_GROUP;
  const entry = groups.find(item => item.profile.id === selectedId);
  const group = entry?.profile;

  if (target.view === 'profiles' && target.profileId) {
    return <ProfileEditor key={target.profileId} profileId={target.profileId} onClose={() => onNavigate({ view: 'groups', profileId: target.profileId === 'nuevo' ? undefined : target.profileId })} />;
  }
  if (loadError) return <EuiCallOut color='danger' iconType='alert' title={loadError} />;

  const select = (id: string) => onNavigate({ view: 'groups', profileId: id });
  const open = (agentId: string) => onNavigate({ view: 'groups', profileId: selectedId, hostId: agentId });

  return (
    <EuiFlexGroup gutterSize='m' alignItems='flexStart' wrap>
      <EuiFlexItem grow={false} style={{ width: 320, minWidth: 260 }}>
        <GroupList
          groups={groups}
          counts={counts}
          withoutGroup={summary.data?.withoutProfile || 0}
          selected={selectedId}
          onSelect={select}
          onCreate={() => setDialog('new')}
          onExport={() => setDialog('export')}
        />
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 480 }}>
        {target.hostId ? (
          <MachineDetail
            agentId={target.hostId}
            groupName={selectedId === NO_GROUP ? 'Sin grupo' : group?.name}
            revision={revision}
            onBack={() => onNavigate({ view: 'groups', profileId: selectedId })}
            onNavigate={onNavigate}
            onConfigurationSaved={onConfigurationSaved}
          />
        ) : (
          <EuiPanel hasBorder>
            <EuiFlexGroup justifyContent='spaceBetween' alignItems='flexStart' wrap>
              <EuiFlexItem>
                <EuiTitle size='s'>
                  <h2>{group ? group.name : 'Sin grupo'}</h2>
                </EuiTitle>
                <EuiSpacer size='s' />
                <EuiDescriptionList
                  type='inline'
                  compressed
                  listItems={
                    group
                      ? [
                          { title: 'Máquinas', description: String(counts[group.id] || 0) },
                          { title: 'Capa', description: layerLabel(group.layer) },
                          isHandPicked(group)
                            ? { title: 'Selección', description: handPickedHosts(group).join(', ') || '—' }
                            : { title: 'Condición', description: matchText(group.match) },
                        ]
                      : [{ title: 'Máquinas fuera de grupo', description: String(summary.data?.withoutProfile || 0) }]
                  }
                />
              </EuiFlexItem>
              {group && (
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize='s' responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiButton size='s' iconType='importAction' isDisabled={!canChange} onClick={() => setLoadingTemplate(true)}>
                        Cargar plantilla
                      </EuiButton>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton size='s' onClick={() => onNavigate({ view: 'profiles', profileId: group.id })}>
                        Editar grupo
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiSpacer size='m' />
            {group && (
              <>
                <EuiTabs size='s'>
                  <EuiTab isSelected={view === 'controls'} onClick={() => setView('controls')}>
                    Controles
                  </EuiTab>
                  <EuiTab isSelected={view === 'machines'} onClick={() => setView('machines')}>
                    {`Máquinas (${counts[group.id] || 0})`}
                  </EuiTab>
                </EuiTabs>
                <EuiSpacer size='m' />
              </>
            )}
            {group && view === 'controls' ? (
              <GroupControls group={group} onOpen={setControl} />
            ) : (
              <GroupMachines
                groupId={selectedId}
                group={group}
                groups={groups.map(item => item.profile)}
                revision={revision}
                onOpen={open}
                onStage={stageUpsert}
                onConfigurationSaved={onConfigurationSaved}
              />
            )}
            {loading && <EuiText size='xs' color='subdued'>Cargando grupos…</EuiText>}
          </EuiPanel>
        )}
      </EuiFlexItem>
      {control && group && (
        <GroupControlFlyout group={group} control={control} readOnly={!canChange} onApply={stageUpsert} onClose={() => setControl(undefined)} />
      )}
      {dialog === 'new' && (
        <NewProfileModal
          onClose={() => setDialog(undefined)}
          onBlank={() => onNavigate({ view: 'profiles', profileId: 'nuevo' })}
          onDuplicate={id => onNavigate({ view: 'profiles', profileId: `copia:${id}` })}
          onImport={() => setDialog('import')}
        />
      )}
      {dialog === 'import' && <ImportModal onClose={() => setDialog(undefined)} />}
      {dialog === 'export' && <ExportModal onClose={() => setDialog(undefined)} />}
      {loadingTemplate && group && (
        <TemplateModal templates={templates.filter(template => template.id !== group.id)} group={group} onLoad={template => stageUpsert(loadTemplate(group, template))} onClose={() => setLoadingTemplate(false)} />
      )}
    </EuiFlexGroup>
  );
};
