import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTableRow, tableRowText, valuesText } from '../../common/ens/configuration/table-rows';

const column = (label: string) => ({ name: label.toLowerCase(), label, type: 'string' as const, required: false });
const columns = [column('Cuenta'), column('Uso'), column('Ámbito')];

describe('a table value', () => {
  test('splits a row into its columns, padding the missing ones', () => {
    assert.deepEqual(splitTableRow('root | mantenimiento', columns), ['root', 'mantenimiento', '']);
  });

  test('keeps the extra cells of a variadic last column together', () => {
    assert.deepEqual(splitTableRow('root | registros | todos | lectura', columns), ['root', 'registros', 'todos, lectura']);
  });

  test('reads without pipes', () => {
    assert.equal(tableRowText('root | | registros'), 'root · registros');
    assert.equal(valuesText(['root | registros', 'syslog | registros']), 'root · registros; syslog · registros');
    assert.equal(valuesText(['sudo', 'wheel']), 'sudo, wheel');
  });
});
