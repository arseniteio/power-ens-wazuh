import React, { useMemo, useState } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiFieldSearch, EuiSpacer, EuiText, EuiToolTip } from '@elastic/eui';

import type { ReasonDoc, ReasonInline } from '../../../../common/ens/catalog/engine-messages';
import { reasonDocText } from '../../../../common/ens/catalog/engine-messages';
import { formatTimestamp, splitTimestamps } from '../../../../common/ens/evaluation/motive-parser';

export interface ParameterLookup {
  (id: string): { label?: string; description?: string } | undefined;
}

// Lists show this many items before the rest is asked for; a search box appears from SEARCH_FROM.
const LIST_PREVIEW = 8;
const SEARCH_FROM = 15;

const Dated = ({ text }: { text: string }) => (
  <>
    {splitTimestamps(text).map((slice, i) =>
      slice.iso ? (
        <span key={i} title={slice.iso}>
          {formatTimestamp(slice.iso)}
        </span>
      ) : (
        <React.Fragment key={i}>{slice.text}</React.Fragment>
      )
    )}
  </>
);

export const ParameterChip = ({ id, lookup }: { id: string; lookup?: ParameterLookup }) => {
  const info = lookup?.(id);
  const chip = (
    <EuiBadge color='hollow' iconType='gear'>
      {info?.label ? `${id} · ${info.label}` : id}
    </EuiBadge>
  );
  return info?.description ? (
    <EuiToolTip position='top' content={info.description}>
      {chip}
    </EuiToolTip>
  ) : (
    chip
  );
};

const InlinePart = ({ part, lookup }: { part: ReasonInline; lookup?: ParameterLookup }) => {
  if (part.kind === 'parameter') return <ParameterChip id={part.id} lookup={lookup} />;
  if (part.kind === 'value') {
    return (
      <strong>
        <Dated text={part.text} />
      </strong>
    );
  }
  return <Dated text={part.text} />;
};

const ReasonList = ({ items, lookup }: { items: ReasonDoc[]; lookup?: ParameterLookup }) => {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? items.filter(item => reasonDocText(item).toLowerCase().includes(needle)) : items;
  }, [items, filter]);
  const visible = showAll || filter ? filtered : filtered.slice(0, LIST_PREVIEW);

  return (
    <div style={{ marginTop: 4 }}>
      {items.length >= SEARCH_FROM && (
        <>
          <EuiFieldSearch compressed placeholder={`Buscar en ${items.length} elementos`} value={filter} onChange={e => setFilter(e.target.value)} />
          <EuiSpacer size='xs' />
        </>
      )}
      <ul style={{ margin: '0 0 0 18px', listStyle: 'disc' }}>
        {visible.map((item, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            <ReasonView doc={item} lookup={lookup} />
          </li>
        ))}
      </ul>
      {!showAll && !filter && filtered.length > LIST_PREVIEW && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setShowAll(true)}>
          {`Mostrar los ${filtered.length}`}
        </EuiButtonEmpty>
      )}
      {filter && filtered.length === 0 && (
        <EuiText size='xs' color='subdued'>
          <span>Sin coincidencias</span>
        </EuiText>
      )}
    </div>
  );
};

export const ReasonView = ({ doc, lookup }: { doc: ReasonDoc; lookup?: ParameterLookup }) => (
  <span>
    {doc.inline.map((part, i) => (
      <InlinePart key={i} part={part} lookup={lookup} />
    ))}
    {doc.lists.map((list, i) => (
      <ReasonList key={i} items={list.items} lookup={lookup} />
    ))}
  </span>
);
