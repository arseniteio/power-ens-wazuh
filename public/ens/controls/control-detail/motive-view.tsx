import React, { useContext, useState } from 'react';
import { explainParameter } from '../../../../common/ens/catalog/explanations';
import { ExplainedControl, ExplainedText } from '../../ui/explained-text';
import { EuiBadge, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import {
  formatTimestamp,
  MotiveList,
  MotivePart,
  ParsedMotive,
  splitTimestamps,
} from '../../../../common/ens/evaluation/motive-parser';

import { statusBadgeColor } from '../../status-colors';
import { ENS_THEME } from '../../theme-colors';
import { statusLabel } from '../../../../common/ens/core/status-label';

export { statusBadgeColor };

export interface MotiveParameterInfo {
  id: string;
  label?: string;
  value?: string;
  origin?: string;
}

export interface MotiveViewHandlers {
  onParameter?: (parameterId: string) => void;
  onEvidence?: (evidenceId: string) => void;
  parameterInfo?: (parameterId: string) => MotiveParameterInfo | undefined;
}

const VISIBLE_LIST_SIZE = 5;

export const LinkBadge = ({
  onClick,
  label,
  children,
  ...badge
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  color: string;
  iconType?: string;
  title?: string;
}) =>
  onClick ? (
    <EuiBadge {...badge} onClick={onClick} onClickAriaLabel={label}>
      {children}
    </EuiBadge>
  ) : (
    <EuiBadge {...badge}>{children}</EuiBadge>
  );

const WithDates = ({ text }: { text: string }) => (
  <>
    {splitTimestamps(text).map((slice, i) =>
      slice.iso ? (
        <span key={i} title={slice.iso} style={{ borderBottom: `1px dotted ${ENS_THEME.mutedText}` }}>
          {formatTimestamp(slice.iso)}
        </span>
      ) : (
        <ExplainedText key={i} text={slice.text} />
      )
    )}
  </>
);

const ListView = ({ list }: { list: MotiveList }) => {
  const [isOpen, setIsOpen] = useState(false);
  const visibleItems = isOpen ? list.values : list.values.slice(0, VISIBLE_LIST_SIZE);
  const hidden = list.values.length - visibleItems.length;
  return (
    <>
      <ul style={{ margin: '4px 0 4px 18px', listStyle: 'disc' }}>
        {visibleItems.map((value, i) => (
          <li key={i}>
            <code>
              <WithDates text={value} />
            </code>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setIsOpen(true)}>
          {`y ${hidden} más en la lista`}
        </EuiButtonEmpty>
      )}
      {list.more !== undefined && (
        <EuiText size='xs' color='subdued'>
          <span>{`y ${list.more} más (el motivo solo nombra ${list.values.length})`}</span>
        </EuiText>
      )}
    </>
  );
};

export const MotiveText = ({ text, list }: { text: string; list?: MotiveList }) =>
  list ? (
    <>
      <WithDates text={text.slice(0, list.start)} />
      <ListView list={list} />
      <WithDates text={text.slice(list.end)} />
    </>
  ) : (
    <WithDates text={text} />
  );

export const ParameterBadges = ({ ids, handlers }: { ids: { id: string; label?: string }[]; handlers: MotiveViewHandlers }) => {
  const control = useContext(ExplainedControl);
  return (
  <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
    {ids.map(parameter => {
      const info = handlers.parameterInfo?.(parameter.id);
      const text = `${parameter.id}${parameter.label || info?.label ? ` · ${parameter.label || info?.label}` : ''}`;
      const detail = info?.value !== undefined ? `${info.value}${info.origin ? ` (${info.origin})` : ''}` : undefined;
      const meaning = explainParameter(control, parameter.id)?.text;
      return (
        <EuiFlexItem grow={false} key={parameter.id}>
          <LinkBadge
            color='hollow'
            iconType='gear'
            title={[meaning, detail ? `Valor que aplica: ${detail}` : `Configurar ${parameter.id}`].filter(Boolean).join(' · ')}
            onClick={handlers.onParameter ? () => handlers.onParameter!(parameter.id) : undefined}
            label={`Configurar ${parameter.id}`}
          >
            {text}
          </LinkBadge>
          {detail && (
            <EuiText size='xs' color='subdued'>
              <span>{`aplica: ${detail}`}</span>
            </EuiText>
          )}
        </EuiFlexItem>
      );
    })}
  </EuiFlexGroup>
  );
};

const MotivePartView = ({ part, handlers, withSummary = true }: { part: MotivePart; handlers: MotiveViewHandlers; withSummary?: boolean }) => (
  <div style={{ marginBottom: 8 }}>
    <EuiText size='s'>
      <div style={{ marginBottom: 4 }}>
        {part.evidenceId && (
          <>
            <LinkBadge
              color='hollow'
              onClick={handlers.onEvidence ? () => handlers.onEvidence!(part.evidenceId!) : undefined}
              label={`Ver ${part.evidenceId} en Evidencias`}
            >
              {part.evidenceId}
            </LinkBadge>{' '}
            <EuiBadge color={statusBadgeColor(part.status)}>{statusLabel(part.status)}</EuiBadge>{' '}
          </>
        )}
        {withSummary ? <MotiveText text={part.text} list={part.list} /> : <MotiveText text={part.detail} list={undefined} />}
      </div>
    </EuiText>
    {part.parameters.length > 0 && <ParameterBadges ids={part.parameters} handlers={handlers} />}
    {part.secondary !== undefined && (
      <EuiText size='xs' color='subdued'>
        <div style={{ marginTop: 4 }}>
          <strong>Además:</strong> <MotiveText text={part.secondary} />
        </div>
      </EuiText>
    )}
  </div>
);

export const MotiveView = ({ parsed, label, handlers }: { parsed: ParsedMotive; label?: string; handlers: MotiveViewHandlers }) => (
  <div style={{ marginBottom: 12 }}>
    {(label || parsed.machines || parsed.policy) && (
      <EuiText size='xs' color='subdued'>
        <p style={{ marginBottom: 4 }}>
          {[label, parsed.machines, parsed.policy ? `resuelta por ${parsed.policy.policyId} (${parsed.policy.requirementId})` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </EuiText>
    )}
    {parsed.question !== undefined ? (
      <EuiText size='s' color='subdued'>
        <p style={{ fontStyle: 'italic' }}>Pregunta de auditoría: {parsed.question}</p>
      </EuiText>
    ) : (
      parsed.parts.map((part, i) => <MotivePartView key={i} part={part} handlers={handlers} />)
    )}
  </div>
);
