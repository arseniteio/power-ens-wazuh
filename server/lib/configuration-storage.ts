import { randomBytes } from 'crypto';
import type { Logger } from '../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../common/constants';
import {
  configurationDocumentId,
  DEFAULT_ENS_SYSTEM,
  DEFAULT_ENS_SYSTEM_NAME,
  isDefaultSystem,
  systemFilter,
} from '../../common/ens/systems';
import type { ENSSystemScope, ENSSystemSummary } from '../../common/ens/systems';
import { assertCompleteResponse } from './evaluation/search';

export type ENSConfigurationDocumentType = 'ACTIVE_CONFIGURATION' | 'SYSTEM_CONFIGURATION' | 'CONFIGURATION_HISTORY';

export interface ENSConfigurationStoredDocument {
  documentType: ENSConfigurationDocumentType;
  system?: ENSSystemSummary;
  systemId?: string;
  configuration: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const isIndexAlreadyCreatedError = (error: any): boolean => {
  const errorType = error?.body?.error?.type || error?.meta?.body?.error?.type;

  return (
    errorType === 'resource_already_exists_exception' ||
    String(error?.message || error).includes('resource_already_exists_exception')
  );
};

const systemProperties = {
  systemId: { type: 'keyword' },
  system: { properties: { id: { type: 'keyword' }, name: { type: 'keyword' } } },
};

let systemMappingEnsured = false;

// Indices created before ENS systems existed get the system fields mapped as keywords before a
// document carries them, so a term query on a hyphenated id still matches.
async function ensureSystemMapping(client: any): Promise<void> {
  if (systemMappingEnsured) return;
  await client.indices.putMapping({ index: ENS_CONFIGURATION_INDEX, body: { properties: systemProperties } });
  systemMappingEnsured = true;
}

export async function ensureENSConfigurationIndex(client: any, logger: Logger): Promise<void> {
  const exists = await client.indices.exists({ index: ENS_CONFIGURATION_INDEX });

  if (exists.body) {
    await ensureSystemMapping(client);
    return;
  }

  try {
    await client.indices.create({
      index: ENS_CONFIGURATION_INDEX,
      body: {
        settings: { index: { number_of_shards: 1, auto_expand_replicas: '0-1' } },
        mappings: {
          properties: {
            documentType: { type: 'keyword' },
            ...systemProperties,
            createdAt: { type: 'date' },
            createdBy: { type: 'keyword' },
            updatedAt: { type: 'date' },
            updatedBy: { type: 'keyword' },
            configuration: { type: 'object', enabled: false },
          },
        },
      },
    });

    systemMappingEnsured = true;
    logger.info(`Index ${ENS_CONFIGURATION_INDEX} created`);
  } catch (error) {
    if (!isIndexAlreadyCreatedError(error)) {
      throw error;
    }
  }
}

export interface ENSConfigurationDocumentVersion {
  seqNo: number;
  primaryTerm: number;
}

export class ENSConfigurationConflictError extends Error {
  constructor() {
    super('La configuración ha cambiado desde que la abriste. Recarga la página para ver los cambios.');
  }
}

const versionOf = (seqNo: unknown, primaryTerm: unknown): ENSConfigurationDocumentVersion | undefined =>
  Number.isInteger(seqNo) && Number.isInteger(primaryTerm) ? { seqNo: seqNo as number, primaryTerm: primaryTerm as number } : undefined;

export const parseConfigurationVersion = (value: any): ENSConfigurationDocumentVersion | undefined =>
  value && typeof value === 'object' ? versionOf(value.seqNo, value.primaryTerm) : undefined;

export async function readActiveENSConfigurationWithVersion(
  client: any,
  logger: Logger,
  system: string = DEFAULT_ENS_SYSTEM
): Promise<{ document?: ENSConfigurationStoredDocument; version?: ENSConfigurationDocumentVersion }> {
  await ensureENSConfigurationIndex(client, logger);

  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    ignore_unavailable: true,
    body: {
      size: 1,
      seq_no_primary_term: true,
      query: { ids: { values: [configurationDocumentId(system)] } },
    },
  });

  assertCompleteResponse(result.body, 'la configuración ENS');
  const hit = result.body?.hits?.hits?.[0];

  return { document: hit?._source as ENSConfigurationStoredDocument | undefined, version: hit ? versionOf(hit._seq_no, hit._primary_term) : undefined };
}

export async function readActiveENSConfiguration(
  client: any,
  logger: Logger,
  system: string = DEFAULT_ENS_SYSTEM
): Promise<ENSConfigurationStoredDocument | undefined> {
  return (await readActiveENSConfigurationWithVersion(client, logger, system)).document;
}

export async function listENSSystems(client: any, logger: Logger): Promise<ENSSystemScope[]> {
  await ensureENSConfigurationIndex(client, logger);

  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    ignore_unavailable: true,
    body: {
      size: 1000,
      query: { terms: { documentType: ['ACTIVE_CONFIGURATION', 'SYSTEM_CONFIGURATION'] } },
      _source: ['documentType', 'system', 'configuration.scope'],
    },
  });

  assertCompleteResponse(result.body, 'los sistemas ENS');
  const systems: ENSSystemScope[] = [{ id: DEFAULT_ENS_SYSTEM, name: DEFAULT_ENS_SYSTEM_NAME }];
  for (const hit of result.body?.hits?.hits || []) {
    const doc = hit._source || {};
    const scope = doc.configuration?.scope;
    if (doc.documentType === 'ACTIVE_CONFIGURATION') systems[0].scope = scope;
    else if (doc.system?.id) systems.push({ id: doc.system.id, name: doc.system.name || doc.system.id, scope });
  }
  return [systems[0], ...systems.slice(1).sort((a, b) => a.id.localeCompare(b.id))];
}

export async function deleteENSSystem(client: any, logger: Logger, system: string): Promise<boolean> {
  await ensureENSConfigurationIndex(client, logger);
  const result = await client.delete(
    { index: ENS_CONFIGURATION_INDEX, id: configurationDocumentId(system), refresh: 'wait_for' },
    { ignore: [404] }
  );
  return result.body?.result === 'deleted';
}

export async function readENSConfigurationHistory(
  client: any,
  logger: Logger,
  size: number = 100,
  system: string = DEFAULT_ENS_SYSTEM
): Promise<ENSConfigurationStoredDocument[]> {
  await ensureENSConfigurationIndex(client, logger);

  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size,
      query: { bool: { filter: [{ term: { documentType: 'CONFIGURATION_HISTORY' } }, systemFilter(system, 'systemId')] } },
      sort: [{ createdAt: { order: 'desc' } }],
    },
  });

  assertCompleteResponse(result.body, 'el historial de la configuración ENS');
  return (result.body?.hits?.hits || []).map((hit: any) => hit._source as ENSConfigurationStoredDocument);
}

export async function persistENSConfiguration(
  client: any,
  logger: Logger,
  configuration: Record<string, unknown>,
  username: string,
  previous?: { configuration: Record<string, unknown>; author?: string },
  expected?: ENSConfigurationDocumentVersion | 'absent',
  system: ENSSystemSummary = { id: DEFAULT_ENS_SYSTEM, name: DEFAULT_ENS_SYSTEM_NAME }
): Promise<ENSConfigurationStoredDocument & { version?: ENSConfigurationDocumentVersion; historyError?: string }> {
  await ensureENSConfigurationIndex(client, logger);

  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const historyId = ['history', now, randomBytes(6).toString('hex')].join('-');
  const previousLines = previous
    ? [
        JSON.stringify({ create: { _index: ENS_CONFIGURATION_INDEX, _id: ['history', now - 1, randomBytes(6).toString('hex')].join('-') } }),
        JSON.stringify({
          documentType: 'CONFIGURATION_HISTORY',
          systemId: system.id,
          configuration: previous.configuration,
          createdAt: new Date(now - 1).toISOString(),
          createdBy: previous.author || 'desconocido',
        }),
      ]
    : [];

  const activeDocument: ENSConfigurationStoredDocument = {
    documentType: isDefaultSystem(system.id) ? 'ACTIVE_CONFIGURATION' : 'SYSTEM_CONFIGURATION',
    ...(isDefaultSystem(system.id) ? {} : { system }),
    configuration,
    updatedAt: timestamp,
    updatedBy: username,
  };

  const historyDocument: ENSConfigurationStoredDocument = {
    documentType: 'CONFIGURATION_HISTORY',
    systemId: system.id,
    configuration,
    createdAt: timestamp,
    createdBy: username,
  };

  const target = { _index: ENS_CONFIGURATION_INDEX, _id: configurationDocumentId(system.id) };
  const action =
    expected === 'absent'
      ? { create: target }
      : expected
        ? { index: { ...target, if_seq_no: expected.seqNo, if_primary_term: expected.primaryTerm } }
        : { index: target };
  const written = await client.bulk({ body: `${JSON.stringify(action)}\n${JSON.stringify(activeDocument)}\n`, refresh: 'wait_for' });
  const item = written.body?.items?.[0]?.create || written.body?.items?.[0]?.index;

  if (written.body?.errors) {
    if (item?.status === 409 || item?.error?.type === 'version_conflict_engine_exception') {
      throw new ENSConfigurationConflictError();
    }
    throw new Error(`Could not persist ENS configuration: ${JSON.stringify(item?.error || written.body.items)}`);
  }

  const historyBody = [
    ...previousLines,
    JSON.stringify({ create: { _index: ENS_CONFIGURATION_INDEX, _id: historyId } }),
    JSON.stringify(historyDocument),
    '',
  ].join('\n');

  const saved = { ...activeDocument, version: versionOf(item?._seq_no, item?._primary_term) };

  try {
    const result = await client.bulk({ body: historyBody, refresh: 'wait_for' });
    if (result.body?.errors) {
      const failures = (result.body.items || []).map((entry: any) => entry.create?.error || entry.index?.error).filter(Boolean);
      return { ...saved, historyError: JSON.stringify(failures) };
    }
  } catch (error: any) {
    return { ...saved, historyError: error?.message || String(error) };
  }

  return saved;
}
