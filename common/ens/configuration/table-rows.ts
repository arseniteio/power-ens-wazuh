import type { ENSParameterColumn } from './types';

// A table value is stored as one "a | b | c" string per row; the last column may be variadic.
export const splitTableRow = (row: string, columns: ENSParameterColumn[]): string[] => {
  const parts = row.split('|').map(part => part.trim());
  const count = columns.length;
  if (!count) return parts;
  if (parts.length > count) return [...parts.slice(0, count - 1), parts.slice(count - 1).filter(Boolean).join(', ')];
  return [...parts, ...Array(count - parts.length).fill('')];
};

export const tableRowText = (row: string): string =>
  row
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .join(' · ');

export const valuesText = (values: unknown[]): string => {
  const items = values.map(value => String(value).trim()).filter(Boolean);
  return items.some(item => item.includes('|')) ? items.map(tableRowText).join('; ') : items.join(', ');
};
