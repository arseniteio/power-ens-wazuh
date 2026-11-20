import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  addTableRow,
  ENSTableCellModel,
  removeTableRow,
  resolveTableFieldModel,
  setTableCell,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';
import { Choice } from '../../../ui/choice';
import { ParameterLabel } from './parameter-label';


const MIN_CELL = 140;

const requiredColumn = (
  cell: ENSTableCellModel
): boolean => cell.column.required;

const EditableCell = ({
  cell,
  invalid: invalidOne,
  onCellChange,
}: {
  cell: ENSTableCellModel;
  invalid: boolean;
  onCellChange: (value: string) => void;
}) => {
  if (cell.column.type === 'select') {
    return (
      <Choice
        legend={cell.column.label}
        options={[{ value: '', text: 'Sin seleccionar' }, ...cell.options.map(option => ({ value: option.value, text: option.label }))]}
        value={cell.value}
        onChange={onCellChange}
      />
    );
  }

  if (cell.column.type === 'multiselect') {
    const declared = cell.options.map(
      option => ({ label: option.value })
    );

    return (
      <EuiComboBox
        fullWidth
        compressed
        isInvalid={invalidOne}
        aria-label={cell.column.label}
        placeholder={cell.placeholder}
        noSuggestions={declared.length === 0}
        options={declared}
        selectedOptions={cell.items.map(
          item => ({ label: item })
        )}
        onCreateOption={
          declared.length === 0
            ? typedValue => {
                const item = String(
                  typedValue
                ).trim();

                if (
                  !item ||
                  cell.items.includes(item)
                ) {
                  return;
                }

                onCellChange(
                  [...cell.items, item].join(',')
                );
              }
            : undefined
        }
        onChange={selectedOnes =>
          onCellChange(
            selectedOnes
              .map(option =>
                String(option.label).trim()
              )
              .join(',')
          )
        }
      />
    );
  }

  return (
    <EuiFieldText
      fullWidth
      compressed
      isInvalid={invalidOne}
      aria-label={cell.column.label}
      placeholder={cell.placeholder}
      value={cell.value}
      onChange={event =>
        onCellChange(event.target.value)
      }
    />
  );
};

export const TableParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const model = resolveTableFieldModel(
    parameter,
    value
  );

  const verdict = validateParameterValue(
    parameter,
    value
  );

  const publish = (
    nextItem: string[] | undefined
  ) => onChange(parameter.name, nextItem);

  const requiredColumns = model.columns
    .filter(column => column.required)
    .map(column => column.label)
    .join(', ');

  const requiredColumnsDetail = requiredColumns ? [`Columnas obligatorias: ${requiredColumns}.`] : [];

  return (
    <EuiFormRow
      label={<ParameterLabel parameter={parameter} details={requiredColumnsDetail} />}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <div>
        <EuiFlexGroup
          gutterSize="s"
          responsive={false}
          alignItems="center"
        >
          {model.columns.map(column => (
            <EuiFlexItem
              key={column.name}
              style={{
                minWidth: MIN_CELL,
              }}
            >
              <EuiText size="xs">
                <strong>
                  {column.required
                    ? `${column.label} *`
                    : column.label}
                </strong>
              </EuiText>
            </EuiFlexItem>
          ))}
          <EuiFlexItem
            grow={false}
            style={{ width: 32 }}
          />
        </EuiFlexGroup>

        <EuiSpacer size="xs" />

        {model.rows.length === 0 && (
          <EuiText size="s" color="subdued">
            <p>
              Sin filas
            </p>
          </EuiText>
        )}

        {model.rows.map((row, rowIndex) => (
          <React.Fragment
            key={`fila-${rowIndex}`}
          >
            <EuiFlexGroup
              gutterSize="s"
              responsive={false}
              alignItems="flexStart"
            >
              {row.cells.map(
                (cell, cellIndex) => (
                  <EuiFlexItem
                    key={cell.column.name}
                    style={{
                      minWidth: MIN_CELL,
                    }}
                  >
                    <EditableCell
                      cell={cell}
                      invalid={
                        !!cell.reason ||
                        (row.overflow > 0 &&
                          cellIndex ===
                            row.cells.length -
                              1) ||
                        (requiredColumn(
                          cell
                        ) &&
                          !cell.value)
                      }
                      onCellChange={newCellValue =>
                        publish(
                          setTableCell(
                            value,
                            parameter,
                            rowIndex,
                            cellIndex,
                            newCellValue
                          )
                        )
                      }
                    />
                  </EuiFlexItem>
                )
              )}
              <EuiFlexItem
                grow={false}
                style={{ width: 32 }}
              >
                <EuiButtonIcon
                  iconType="trash"
                  color="danger"
                  aria-label={`Quitar la fila ${rowIndex +
                    1}`}
                  onClick={() =>
                    publish(
                      removeTableRow(
                        value,
                        rowIndex
                      )
                    )
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </React.Fragment>
        ))}

        <EuiButtonEmpty
          size="s"
          iconType="plusInCircle"
          onClick={() =>
            publish(addTableRow(value))
          }
        >
          Añadir fila
        </EuiButtonEmpty>
      </div>
    </EuiFormRow>
  );
};
