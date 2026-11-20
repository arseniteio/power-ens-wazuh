import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFieldText,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { updateActiveGlobalConfiguration } from '../../../../common/ens/configuration/services';
import { ENSGlobalConfiguration } from '../../../../common/ens/configuration/types';
import { ENSCatalog } from '../../../../common/ens/catalog';
import type { ENSLevelDimension } from '../../../../common/ens/catalog/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSION_NAMES,
  ENS_DIMENSIONS,
  ENS_CATEGORY_LABELS,
  describeDimensionsAboveENSLevel,
  listControlDimensions,
} from '../../../../common/ens/core/control-level';
import { Choice } from '../../ui/choice';

interface GlobalConfigurationPanelProps {
  configuration: ENSGlobalConfiguration;
  onConfigurationSaved: () => void;
}

const categoryOptions = (['BAJO', 'MEDIO', 'ALTO'] as const).map(value => ({ value, text: ENS_CATEGORY_LABELS[value] }));

const dimensionLevelOptions = [
  {
    value: '',
    text: 'Según la categoría',
  },
  ...(['BAJO', 'MEDIO', 'ALTO'] as const).map(value => ({ value, text: value })),
];

const describeDimensionUse = (dimension: ENSLevelDimension): string => {
  const users = ENSCatalog.filter(control => listControlDimensions(control).includes(dimension)).map(control => control.id);

  return users.length
    ? `Afecta a ${users.length} ${users.length === 1 ? 'control' : 'controles'}. Sin valor: categoría del sistema.`
    : 'No afecta a ningún control.';
};

const evaluationPeriodOptions = [
  {
    value: 'Últimas 24 horas',
    text: 'Últimas 24 horas',
  },
  {
    value: 'Últimos 7 días',
    text: 'Últimos 7 días',
  },
  {
    value: 'Últimos 30 días',
    text: 'Últimos 30 días',
  },
  {
    value: 'Últimos 90 días',
    text: 'Últimos 90 días',
  },
];

const reportLanguageOptions = [
  {
    value: 'es',
    text: 'Español',
  },
  {
    value: 'en',
    text: 'Inglés',
  },
];

export const GlobalConfigurationPanel = ({
  configuration,
  onConfigurationSaved,
}: GlobalConfigurationPanelProps) => {
  const [
    draftConfiguration,
    setDraftConfiguration,
  ] = useState<ENSGlobalConfiguration>(
    configuration
  );

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    saveError,
    setSaveError,
  ] = useState<string | undefined>();

  const [
    saveSuccess,
    setSaveSuccess,
  ] = useState<string | undefined>();

  useEffect(() => {
    setDraftConfiguration(
      configuration
    );

    setSaveError(undefined);
    setSaveSuccess(undefined);
  }, [configuration]);

  const hasChanges =
    useMemo(
      () =>
        JSON.stringify(
          draftConfiguration
        ) !==
        JSON.stringify(
          configuration
        ),
      [
        draftConfiguration,
        configuration,
      ]
    );

  const updateField = (
    field: keyof ENSGlobalConfiguration,
    value: string
  ) => {
    setDraftConfiguration(
      currentConfiguration => {
        const nextConfiguration = {
          ...currentConfiguration,
          [field]: value,
        } as ENSGlobalConfiguration;

        if (
          !value &&
          (Object.values(ENS_DIMENSION_LEVEL_KEYS) as string[]).includes(field)
        ) {
          delete nextConfiguration[field];
        }

        return nextConfiguration;
      }
    );

    setSaveError(undefined);
    setSaveSuccess(undefined);
  };


  const levelsError = describeDimensionsAboveENSLevel(draftConfiguration);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(undefined);
    setSaveSuccess(undefined);

    try {
      const persistedConfiguration =
        await updateActiveGlobalConfiguration(
          draftConfiguration
        );

      setDraftConfiguration(
        persistedConfiguration.global
      );

      setSaveSuccess(
        'La configuración global ENS se ha guardado correctamente.'
      );

      onConfigurationSaved();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la configuración global ENS.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EuiPanel
      paddingSize='m'
      color='subdued'
    >
      <EuiTitle size='s'>
        <h3>
          Configuración global de evaluación
        </h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiSpacer size='m' />

      {saveError && (
        <>
          <EuiCallOut
            title='No se pudo guardar la configuración'
            color='danger'
            iconType='alert'
          >
            <p>{saveError}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      {saveSuccess && (
        <>
          <EuiCallOut
            title='Configuración guardada'
            color='success'
            iconType='check'
          >
            <p>{saveSuccess}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      <EuiFormRow
        label='Cliente'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.clientName}
          onChange={event =>
            updateField(
              'clientName',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Organización'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.organization}
          onChange={event =>
            updateField(
              'organization',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Categoría del sistema'
        
        fullWidth
      >
        <Choice
          legend='Categoría del sistema'
          options={categoryOptions}
          value={draftConfiguration.ensLevel}
          onChange={(value: string) => updateField(
              'ensLevel',
              value
            )}
        />
      </EuiFormRow>

      {ENS_DIMENSIONS.map(dimension => {
        const key = ENS_DIMENSION_LEVEL_KEYS[dimension];

        return (
          <EuiFormRow
            key={key}
            label={`Nivel de ${ENS_DIMENSION_NAMES[dimension]} (${dimension})`}
            helpText={describeDimensionUse(dimension)}
            fullWidth
          >
            <Choice
              legend={`Nivel de ${ENS_DIMENSION_NAMES[dimension]}`}
              options={dimensionLevelOptions}
              value={draftConfiguration[key] || ''}
              onChange={(value: string) => updateField(key, value)}
            />
          </EuiFormRow>
        );
      })}

      {levelsError && (
        <>
          <EuiCallOut
            title='Niveles incoherentes'
            color='danger'
            iconType='alert'
            size='s'
          >
            <p>{levelsError}</p>
          </EuiCallOut>

          <EuiSpacer size='m' />
        </>
      )}

      <EuiFormRow
        label='Versión ENS'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.ensVersion}
          onChange={event =>
            updateField(
              'ensVersion',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Descripción del alcance (informes)'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.scope}
          onChange={event =>
            updateField(
              'scope',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Periodo de evaluación'
        
        fullWidth
      >
        <Choice
          legend='Periodo de evaluación'
          options={evaluationPeriodOptions}
          value={
            draftConfiguration.evaluationPeriod
          }
          onChange={(value: string) => updateField(
              'evaluationPeriod',
              value
            )}
        />
      </EuiFormRow>

      <EuiFormRow
        label='Zona horaria'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.timezone}
          onChange={event =>
            updateField(
              'timezone',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiFormRow
        label='Idioma de informes'
        
        fullWidth
      >
        <Choice
          legend='Idioma de informes'
          options={reportLanguageOptions}
          value={
            draftConfiguration.reportLanguage
          }
          onChange={(value: string) => updateField(
              'reportLanguage',
              value
            )}
        />
      </EuiFormRow>

      <EuiFormRow
        label='Política aplicada'
        
        fullWidth
      >
        <EuiFieldText
          value={draftConfiguration.activePolicy}
          onChange={event =>
            updateField(
              'activePolicy',
              event.target.value
            )
          }
          fullWidth
        />
      </EuiFormRow>

      <EuiSpacer size='m' />

      <EuiButton
        fill
        isLoading={isSaving}
        disabled={
          isSaving ||
          !hasChanges ||
          Boolean(levelsError)
        }
        onClick={handleSave}
      >
        Guardar configuración global
      </EuiButton>
    </EuiPanel>
  );
};
