import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hostFilterQuery } from '../../server/lib/hosts/host-queries';

const searchedFields = (text: string): string[] => {
  const query: any = hostFilterQuery({ text, filters: {} }, []);
  const word = query.bool.filter[0].bool.filter[0];
  return word.bool.should.map((clause: any) => Object.keys(clause.wildcard)[0]);
};

describe('the asset search', () => {
  test('searches name, host, agent, Wazuh group, distribution and services', () => {
    const fields = searchedFields('web');
    for (const field of ['agent.name', 'hostname', 'agent.id', 'groups', 'distro', 'services']) assert.ok(fields.includes(field), field);
  });

  test('filters by a Wazuh group ignoring case', () => {
    const query: any = hostFilterQuery({ filters: { group: 'ENS' } }, []);
    assert.deepEqual(query.bool.filter, [{ term: { groups: { value: 'ENS', case_insensitive: true } } }]);
  });
});
