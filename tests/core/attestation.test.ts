import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../common/ens/configuration/repository';
import { buildENSResultFromVerdicts } from '../../common/ens/core/engine-verdicts';
import type { ENSEngineVerdict } from '../../common/ens/core/engine-verdicts';

beforeEach(() => {
  ensConfigurationRepository.replaceActive(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
});

describe('a documentary requirement', () => {
  test('keeps the reference and the links of its attestation', () => {
    const verdicts = [
      {
        '@timestamp': '2026-11-20T10:00:00Z',
        control: 'op.acc.1',
        agent: { id: '001' },
        scope: 'requirement',
        requirement: 'op.acc.1.5',
        status: 'COMPLIANT',
        attested: true,
        evidenced: true,
        reason_code: 'requirement.attested',
        reason_args: { reference: 'Política eIDAS', links: ['https://intranet/eidas.pdf'] },
      },
    ] as ENSEngineVerdict[];

    const requirement = buildENSResultFromVerdicts('op.acc.1', 'MEDIO', '001', verdicts, new Date()).requirements.find(r => r.id === 'op.acc.1.5');

    assert.deepEqual(requirement?.attestation, { reference: 'Política eIDAS', links: ['https://intranet/eidas.pdf'] });
  });
});
