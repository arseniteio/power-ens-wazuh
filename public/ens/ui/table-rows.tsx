import React, { useState } from 'react';
import { EuiBasicTable, EuiButtonEmpty } from '@elastic/eui';

import type { ENSParameterColumn } from '../../../common/ens/configuration/types';
import { splitTableRow } from '../../../common/ens/configuration/table-rows';

type Row = Record<string, string>;

export const TableRows = ({ rows, columns, preview = 5 }: { rows: string[]; columns: ENSParameterColumn[]; preview?: number }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, preview);
  const items: Row[] = visible.map((row, index) =>
    Object.fromEntries([['key', `${index}`], ...splitTableRow(row, columns).map((cell, column) => [`c${column}`, cell || '—'])])
  );

  return (
    <>
      <EuiBasicTable<Row>
        compressed
        tableLayout='auto'
        items={items}
        itemId='key'
        columns={columns.map((column, index) => ({ field: `c${index}`, name: column.label }))}
      />
      {!showAll && rows.length > preview && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setShowAll(true)}>
          {`Ver todas (${rows.length})`}
        </EuiButtonEmpty>
      )}
    </>
  );
};
