import type { ENSConfigurationVersion } from '../configuration/types';
import { scalesOf } from './assessments';
import { CCN_SCALE } from './compliance-level';

// Same precedence as the engine: the scale of the machine, then the one of the control, then the
// CCN table. A value with the wrong shape never reaches here: the configuration validator rejects it.
export const scaleFor = (configuration: Pick<ENSConfigurationVersion, 'maturity'> | undefined, controlId: string, agentId?: string): number[] => {
  const scales = configuration ? scalesOf(configuration as ENSConfigurationVersion).filter(scale => scale.controlId === controlId) : [];
  const own = agentId ? scales.find(scale => scale.agentId === agentId) : undefined;
  return (own || scales.find(scale => !scale.agentId))?.thresholds || CCN_SCALE;
};
