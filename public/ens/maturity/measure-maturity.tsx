import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { getActiveENSConfiguration, saveFromLatestConfiguration } from '../../../common/ens/configuration/services/configuration-state-service';
import { assessmentOf, setAssessment } from '../../../common/ens/maturity/assessments';
import {
  ENS_MATURITY_LABELS,
  ENS_MATURITY_MAX,
  ENS_MATURITY_NOTE,
  ENSEngineMaturity,
  incoherenceText,
  ENSMaturityAssessment,
  maturityLabel,
} from '../../../common/ens/maturity/types';
import { dateTimeLabel } from '../../../common/ens/core/date-label';
import { Choice } from '../ui/choice';
import { InfoTip } from '../ui/info-tip';
import { formatTally } from '../../../common/ens/core/tally';

const LEVEL_OPTIONS = [
  { value: '', text: 'Sin valorar' },
  ...Array.from({ length: ENS_MATURITY_MAX + 1 }, (_, level) => ({ value: String(level), text: `L${level} ${ENS_MATURITY_LABELS[level]}` })),
];

const levelOf = (value: string): number | undefined => (value === '' ? undefined : Number(value));

export const AssessModal = ({ measureId, onClose, onSaved }: { measureId: string; onClose: () => void; onSaved: () => void }) => {
  const current: ENSMaturityAssessment = assessmentOf(getActiveENSConfiguration(), measureId) || { measureId };
  const [level, setLevel] = useState(current.level === undefined ? '' : String(current.level));
  const [target, setTarget] = useState(current.target === undefined ? '' : String(current.target));
  const [references, setReferences] = useState(current.references || '');
  const [note, setNote] = useState(current.note || '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const next: ENSMaturityAssessment = {
      measureId,
      level: levelOf(level),
      target: levelOf(target),
      references: references.trim() || undefined,
      note: note.trim() || undefined,
    };
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setAssessment(latest, next),
        reason: `Madurez de ${measureId}: ${next.level === undefined ? 'sin valorar' : `L${next.level}`}${next.target === undefined ? '' : `, objetivo L${next.target}`}.`,
      }));
      onSaved();
      onClose();
    } catch (failure: any) {
      setError(failure?.message || String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <EuiModal onClose={onClose} style={{ width: 560 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>{`Valorar la madurez de ${measureId}`}</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiSpacer size='m' />
        <EuiFormRow label='Nivel valorado' fullWidth labelAppend={<InfoTip content='L3: procedimiento escrito y aplicado. L4: medido, con corrección de desviaciones. L5: mejora continua basada en la medición.' />}>
          <Choice
            legend='Nivel valorado'
            options={LEVEL_OPTIONS}
            value={level}
            onChange={(value: string) => setLevel(value)}
          />
        </EuiFormRow>
        <EuiFormRow label='Nivel objetivo' fullWidth>
          <Choice
            legend='Nivel objetivo'
            options={LEVEL_OPTIONS.map(o => (o.value === '' ? { ...o, text: 'Sin objetivo' } : o))}
            value={target}
            onChange={(value: string) => setTarget(value)}
          />
        </EuiFormRow>
        <EuiFormRow label='Documentos que lo acreditan'  fullWidth>
          <EuiFieldText value={references} onChange={event => setReferences(event.target.value)} fullWidth />
        </EuiFormRow>
        <EuiFormRow label='Observaciones' fullWidth>
          <EuiTextArea value={note} onChange={event => setNote(event.target.value)} rows={3} fullWidth />
        </EuiFormRow>
        {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton fill onClick={save} isLoading={busy} isDisabled={busy}>
          Guardar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

export const MeasureMaturity = ({
  measureId,
  maturity,
  onSaved,
}: {
  measureId: string;
  maturity?: ENSEngineMaturity;
  onSaved: () => void;
}) => {
  const [assessing, setAssessing] = useState(false);
  const declared = assessmentOf(getActiveENSConfiguration(), measureId);
  const assessed = declared?.level;
  const target = declared?.target;

  return (
    <EuiPanel hasBorder paddingSize='m'>
      <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false}>
        <EuiFlexItem>
          <EuiTitle size='xxs'>
            <h3>
              Madurez <InfoTip content={ENS_MATURITY_NOTE} />
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' onClick={() => setAssessing(true)}>
            Valorar
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <EuiFlexGroup gutterSize='s' wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>{`Acreditado: ${maturity?.accredited === undefined ? 'sin medición' : maturityLabel(maturity.accredited)}`}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={assessed === undefined ? 'default' : 'primary'}>{`Valorado: ${assessed === undefined ? 'sin valorar' : maturityLabel(assessed)}`}</EuiBadge>
        </EuiFlexItem>
        {maturity?.tally && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>{`Máquinas conformes: ${formatTally(maturity.tally)}`}</EuiBadge>
          </EuiFlexItem>
        )}
        {target !== undefined && (
          <EuiFlexItem grow={false}>
            <EuiBadge color={(assessed ?? maturity?.accredited ?? 0) < target ? 'warning' : 'success'}>{`Objetivo: L${target}`}</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <EuiText size='xs' color='subdued'>
        {maturity?.machines ? <p>{`Acreditado: mínimo de ${maturity.machines} máquina${maturity.machines === 1 ? '' : 's'}, ${maturity.period_days || 30} días`}</p> : null}
        {declared?.assessedBy && <p>{`Valorado: ${declared.assessedBy}${declared.assessedAt ? `, ${dateTimeLabel(declared.assessedAt)}` : ''}${declared.references ? ` · ${declared.references}` : ''}`}</p>}
      </EuiText>
      {maturity?.incoherent && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut size='s' color='warning' iconType='alert' title={incoherenceText(assessed, maturity.accredited)} />
        </>
      )}
      {assessing && <AssessModal measureId={measureId} onClose={() => setAssessing(false)} onSaved={onSaved} />}
    </EuiPanel>
  );
};
