import { POWER_ENS_EVALUATION_PATH } from '../../common/constants';
import { withRequestTimeout } from '../../common/platform/request-timeout';
import { getHttp } from '../services';
import { systemQuery } from '../../common/ens/selected-system';
import { RequestLimiter } from './refresh-policy';
import type { ENSTraceabilityPageResponse } from '../../common/ens/evaluation/types';

const EVALUATION_TIMEOUT_MS = 180 * 1000;

export interface ENSEvaluationParams {
  include: 'summary' | 'results' | 'dashboard' | 'control' | 'overview';
  agentId?: string;
  controlId?: string;
  timelineDays?: number;
  timelineControls?: boolean;
}

const limiter = new RequestLimiter();

const browserTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

const evaluationQuery = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries({ ...params, ...systemQuery(), timeZone: browserTimeZone() }).filter(([, value]) => value !== undefined && value !== '')
  );

const withMotive = (error: any): Error => {
  const motive = error?.body?.message;
  return typeof motive === 'string' && motive.trim() ? new Error(motive.trim()) : error;
};

const asks = async <T>(path: string, query: Record<string, unknown>, operation: string, controller?: AbortController): Promise<T> => {
  const response: any = await limiter
    .run(() =>
      withRequestTimeout(
        signal => getHttp().get(path, { query: evaluationQuery(query), signal }),
        operation,
        controller,
        EVALUATION_TIMEOUT_MS
      )
    )
    .catch(error => {
      throw withMotive(error);
    });
  if (!response || response.statusCode !== 200 || response.error !== 0) {
    throw new Error(`La evaluación ENS respondió algo inesperado (${operation}).`);
  }
  return response.data as T;
};

export const fetchEvaluation = <T = any>(params: ENSEvaluationParams, controller?: AbortController, options: { retryRefresh?: boolean } = {}) =>
  asks<T>(POWER_ENS_EVALUATION_PATH, { ...params, ...(options.retryRefresh ? { retryRefresh: '1' } : {}) }, 'evaluación ENS', controller);

export const fetchEvaluationProbe = (params: ENSEvaluationParams, controller?: AbortController) =>
  asks<{ fingerprint: string; checkedAt: string; facts: { count: number; newest?: string } }>(
    `${POWER_ENS_EVALUATION_PATH}/probe`,
    { agentId: params.agentId, controlId: params.controlId },
    'comprobación de hechos nuevos',
    controller
  );

export const fetchTraceabilityPage = (
  params: { controlId: string; agentId?: string; from: number; size: number },
  controller?: AbortController
) =>
  asks<ENSTraceabilityPageResponse>(
    `${POWER_ENS_EVALUATION_PATH}/traceability`,
    { ...params },
    'trazabilidad del control',
    controller
  );
