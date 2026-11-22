import { ENSRequestTimeoutError, ENS_REQUEST_TIMEOUT_MS, withRequestTimeout } from '../../../platform/request-timeout';
import { POWER_ENS_CONFIGURATION_PATH } from '../../../constants';
import { systemQuery } from '../../selected-system';

import { ENSConfigurationVersion } from '../types';
import { normalizeOrganizationData } from '../organization/organization-data-migration';

const ENS_CONFIGURATION_API_PATH = POWER_ENS_CONFIGURATION_PATH;

interface ENSConfigurationHttp {
  get<T>(path: string, options?: { signal?: AbortSignal; query?: Record<string, string> }): Promise<T>;
  put<T>(path: string, options?: { body?: string; signal?: AbortSignal; query?: Record<string, string> }): Promise<T>;
  post<T>(path: string, options?: { body?: string; signal?: AbortSignal }): Promise<T>;
}

let httpProvider: (() => ENSConfigurationHttp) | undefined;

export const setENSConfigurationHttp = (provider: () => ENSConfigurationHttp): void => {
  httpProvider = provider;
};

const getHttp = (): ENSConfigurationHttp => {
  if (!httpProvider) {
    throw new Error('Power ENS: el cliente HTTP de la configuración todavía no está disponible');
  }

  return httpProvider();
};

export interface ENSConfigurationMetadata {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  seqNo?: number;
  primaryTerm?: number;
}

export interface ENSConfigurationExpectedVersion {
  seqNo: number;
  primaryTerm: number;
}

export interface ENSConfigurationServerState {
  configuration: ENSConfigurationVersion | null;
  metadata: ENSConfigurationMetadata | null;
  warning?: string;
}

interface ENSConfigurationApiResponse {
  statusCode: number;
  error: number;
  data: ENSConfigurationServerState;
}

interface ENSConfigurationSaveRequest {
  configuration: ENSConfigurationVersion;
  changeReason?: string;
  expectedVersion?: ENSConfigurationExpectedVersion | null;
}

const withoutDerivedParameterStatuses = (
  configuration: ENSConfigurationVersion,
): ENSConfigurationVersion => ({
  ...configuration,
  controls: configuration.controls.map(control => ({
    ...control,
    parameters: control.parameters.map(parameter => {
      const persistableParameter = { ...parameter };
      delete persistableParameter.status;
      return persistableParameter;
    }),
  })),
});

const getResponseData = (
  response: ENSConfigurationApiResponse,
): ENSConfigurationServerState => {
  if (
    !response ||
    response.statusCode !== 200 ||
    response.error !== 0 ||
    !response.data
  ) {
    throw new Error(
      'The ENS configuration server returned an invalid response.',
    );
  }

  return response.data;
};

const withServerReason = (error: any): Error => {
  const reason = error?.body?.message;

  return typeof reason === 'string' && reason.trim()
    ? new Error(reason.trim())
    : error;
};

export async function getENSConfiguration(): Promise<
  ENSConfigurationServerState
> {
  const response =
    await withRequestTimeout(
      signal => getHttp().get<ENSConfigurationApiResponse>(
        ENS_CONFIGURATION_API_PATH, { signal, query: systemQuery() },
      ),
      'configuración ENS',
    ).catch(error => {
      throw withServerReason(error);
    });

  return getResponseData(response);
}

const SAVE_TIMED_OUT =
  'El guardado no ha respondido a tiempo y puede haberse aplicado o no. Recarga la página para ver la configuración actual.';

let saveTimeoutMs = ENS_REQUEST_TIMEOUT_MS;

export async function saveENSConfiguration(
  configuration: ENSConfigurationVersion,
  changeReason?: string,
  expectedVersion?: ENSConfigurationExpectedVersion | null,
): Promise<ENSConfigurationServerState> {
  const normalizedChangeReason = changeReason?.trim();

  const requestBody: ENSConfigurationSaveRequest = {
    configuration: withoutDerivedParameterStatuses(normalizeOrganizationData(configuration).configuration),
    ...(normalizedChangeReason
      ? { changeReason: normalizedChangeReason }
      : {}),
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  };

  const response =
    await withRequestTimeout(
      signal => getHttp().put<ENSConfigurationApiResponse>(
        ENS_CONFIGURATION_API_PATH,
        {
          body: JSON.stringify(requestBody),
          signal,
          query: systemQuery(),
        },
      ),
      'guardado de la configuración ENS',
      undefined,
      saveTimeoutMs,
    ).catch(error => {
      if (error instanceof ENSRequestTimeoutError) {
        throw new Error(SAVE_TIMED_OUT);
      }
      throw withServerReason(error);
    });

  return getResponseData(response);
}
