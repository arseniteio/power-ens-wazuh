
import { startOfDayIn } from '../../common/ens/core/timeline/timeline-cuts';

export interface FakeDoc {
  _id: string;
  _index: string;
  _source: any;
}

const valuesOf = (obj: any, field: string): any[] => {
  if (obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) return obj.flatMap(o => valuesOf(o, field));
  if (typeof obj !== 'object') return [];
  const output: any[] = [];
  if (Object.prototype.hasOwnProperty.call(obj, field)) output.push(...[].concat(obj[field]));
  for (let p = field.indexOf('.'); p !== -1; p = field.indexOf('.', p + 1)) {
    output.push(...valuesOf(obj[field.slice(0, p)], field.slice(p + 1)));
  }
  return output.filter(v => v !== undefined && v !== null && typeof v !== 'object');
};

const pickSource = (source: any, fields: string[] | undefined): any => {
  if (!Array.isArray(fields)) return source;
  const out: any = {};
  for (const f of fields) {
    const parts = f.split('.');
    let since = source;
    let ok = true;
    for (const p of parts) {
      if (since && typeof since === 'object' && p in since) since = since[p];
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let towards = out;
    parts.slice(0, -1).forEach(p => {
      towards = towards[p] = towards[p] || {};
    });
    towards[parts[parts.length - 1]] = since;
  }
  return out;
};

let indexNow: () => number = () => Date.now();
const UNIT: Record<string, number> = { m: 60e3, h: 3600e3, d: 86400e3 };
const time = (v: any): number => {
  if (typeof v === 'number') return v;
  const text = String(v);
  if (text === 'now') return indexNow();
  const m = /^now-(\d+)([mhd])$/.exec(text);
  return m ? indexNow() - Number(m[1]) * UNIT[m[2]] : Date.parse(text);
};

const DATE_FIELDS = new Set(['@timestamp', 'timestamp']);

const matches = (doc: FakeDoc, q: any): boolean => {
  if (!q || typeof q !== 'object') return true;
  if (q.match_all) return true;
  if (q.match_none) return false;
  if (q.ids) return q.ids.values.includes(doc._id);
  if (q.bool) {
    const b = q.bool;
    const list = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    if (!list(b.filter).every((c: any) => matches(doc, c))) return false;
    if (!list(b.must).every((c: any) => matches(doc, c))) return false;
    if (list(b.must_not).some((c: any) => matches(doc, c))) return false;
    const should = list(b.should);
    if (should.length) {
      const minimum = b.minimum_should_match ?? (list(b.filter).length || list(b.must).length ? 0 : 1);
      if (should.filter((c: any) => matches(doc, c)).length < minimum) return false;
    }
    return true;
  }
  if (q.range) {
    const [field, r]: [string, any] = Object.entries(q.range)[0] as any;
    return valuesOf(doc._source, field).some(v => {
      const t = time(v);
      return (r.gte === undefined || t >= time(r.gte)) && (r.lte === undefined || t <= time(r.lte)) &&
        (r.gt === undefined || t > time(r.gt)) && (r.lt === undefined || t < time(r.lt));
    });
  }
  if (q.term) {
    const [field, value]: [string, any] = Object.entries(q.term)[0] as any;
    const searched = value && typeof value === 'object' && 'value' in value ? value.value : value;
    return valuesOf(doc._source, field).some(v => String(v) === String(searched));
  }
  if (q.terms) {
    const [field, values]: [string, any] = Object.entries(q.terms)[0] as any;
    return valuesOf(doc._source, field).some(v => values.map(String).includes(String(v)));
  }
  if (q.match_phrase) {
    const [field, value]: [string, any] = Object.entries(q.match_phrase)[0] as any;
    return valuesOf(doc._source, field).some(v => String(v) === String(value));
  }
  if (q.exists) return valuesOf(doc._source, q.exists.field).length > 0;
  throw new Error(`fake-indexer: unsupported query ${JSON.stringify(q).slice(0, 120)}`);
};

const orderValue = (doc: FakeDoc, field: string): number | string | null => {
  if (field === '_id') throw new Error('fake-indexer: sorting by _id is not supported (it loads its fielddata in OpenSearch)');
  const v = valuesOf(doc._source, field)[0];
  if (v === undefined) return null;
  return DATE_FIELDS.has(field) ? time(v) : String(v);
};

const orderOf = (s: any): { field: string; desc: boolean } => {
  const [field, o]: [string, any] = Object.entries(s)[0] as any;
  return { field, desc: (o?.order || o) === 'desc' };
};

const compare = (a: number | string | null, b: number | string | null, desc: boolean): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = a < b ? -1 : 1;
  return desc ? -r : r;
};

const sorts = (docs: FakeDoc[], sort: any[] = []) => {
  const keys = sort.map(orderOf);
  return [...docs].sort((a, b) => {
    for (const { field, desc } of keys) {
      const r = compare(orderValue(a, field), orderValue(b, field), desc);
      if (r) return r;
    }
    return 0;
  });
};

const startOfDay = (t: number, timeZone: string): number => startOfDayIn(new Date(t), timeZone).getTime();

const aggregate = (docs: FakeDoc[], aggs: any): any => {
  const output: any = {};
  for (const [name, def] of Object.entries<any>(aggs || {})) {
    if (def.max || def.min) {
      const field = (def.max || def.min).field;
      let value: number | null = null;
      for (const d of docs) {
        for (const v of valuesOf(d._source, field)) {
          const t = time(v);
          if (!Number.isFinite(t)) continue;
          if (value === null || (def.max ? t > value : t < value)) value = t;
        }
      }
      output[name] = { value: value };
    } else if (def.filters) {
      output[name] = {
        buckets: Object.fromEntries(
          Object.entries<any>(def.filters.filters).map(([k, q]) => {
            const inside = docs.filter(d => matches(d, q));
            return [k, { doc_count: inside.length, ...aggregate(inside, def.aggs) }];
          })
        ),
      };
    } else if (def.filter) {
      const inside = docs.filter(d => matches(d, def.filter));
      output[name] = { doc_count: inside.length, ...aggregate(inside, def.aggs) };
    } else if (def.terms) {
      const groups = new Map<string, FakeDoc[]>();
      for (const d of docs) {
        const values = def.terms.field === '_index' ? [d._index] : valuesOf(d._source, def.terms.field);
        const keys = values.length ? values.map(String) : def.terms.missing !== undefined ? [String(def.terms.missing)] : [];
        for (const k of keys) {
          const g = groups.get(k);
          if (g) g.push(d);
          else groups.set(k, [d]);
        }
      }
      const all = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
      const buckets = all.slice(0, def.terms.size ?? 10);
      output[name] = {
        sum_other_doc_count: all.slice(def.terms.size ?? 10).reduce((n, [, ds]) => n + ds.length, 0),
        buckets: buckets.map(([key, ds]) => ({ key, doc_count: ds.length, ...aggregate(ds, def.aggs) })),
      };
    } else if (def.multi_terms) {
      const groups = new Map<string, { key: string[]; docs: FakeDoc[] }>();
      for (const d of docs) {
        const key: string[] = [];
        for (const t of def.multi_terms.terms) {
          const values = valuesOf(d._source, t.field);
          if (values.length) key.push(String(values[0]));
          else if (t.missing !== undefined) key.push(String(t.missing));
          else break;
        }
        if (key.length < def.multi_terms.terms.length) continue;
        const k = JSON.stringify(key);
        const g = groups.get(k);
        if (g) g.docs.push(d);
        else groups.set(k, { key, docs: [d] });
      }
      const [by, direction]: [string, string] = Object.entries<any>(def.multi_terms.order || { _count: 'desc' })[0];
      const valueOf = (b: any) => (by === '_count' ? b.doc_count : by === '_key' ? b.key_as_string : b[by]?.value ?? null);
      const all = [...groups.values()]
        .map(g => ({ key: g.key, key_as_string: g.key.join('|'), doc_count: g.docs.length, ...aggregate(g.docs, def.aggs) }))
        .sort((a, b) => compare(valueOf(a), valueOf(b), direction === 'desc') || (a.key_as_string < b.key_as_string ? -1 : 1));
      const size = def.multi_terms.size ?? 10;
      output[name] = {
        doc_count_error_upper_bound: 0,
        sum_other_doc_count: all.slice(size).reduce((n, b) => n + b.doc_count, 0),
        buckets: all.slice(0, size),
      };
    } else if (def.composite) {
      const names = def.composite.sources.map((source: any) => Object.keys(source)[0]);
      const fields = def.composite.sources.map((source: any) => (Object.values(source)[0] as any).terms.field);
      const groups = new Map<string, { key: Record<string, string>; docs: FakeDoc[] }>();
      for (const d of docs) {
        const values = fields.map((field: string) => valuesOf(d._source, field)[0]);
        if (values.some((v: unknown) => v === undefined)) continue;
        const k = JSON.stringify(values);
        const g = groups.get(k);
        if (g) g.docs.push(d);
        else groups.set(k, { key: Object.fromEntries(names.map((name: string, i: number) => [name, String(values[i])])), docs: [d] });
      }
      const order = (key: Record<string, string>) => names.map((name: string) => key[name]).join('\u0000');
      const after = def.composite.after ? order(def.composite.after) : undefined;
      const sorted = [...groups.values()].sort((a, b) => (order(a.key) < order(b.key) ? -1 : 1)).filter(g => after === undefined || order(g.key) > after);
      const page = sorted.slice(0, def.composite.size ?? 10);
      output[name] = {
        after_key: page.length ? page[page.length - 1].key : undefined,
        buckets: page.map(g => ({ key: g.key, doc_count: g.docs.length, ...aggregate(g.docs, def.aggs) })),
      };
    } else if (def.value_count) {
      output[name] = { value: docs.reduce((n, d) => n + valuesOf(d._source, def.value_count.field).length, 0) };
    } else if (def.top_hits) {
      const sorted = sorts(docs, def.top_hits.sort);
      output[name] = {
        hits: { hits: sorted.slice(0, def.top_hits.size || 3).map(d => ({ _id: d._id, _source: pickSource(d._source, def.top_hits._source) })) },
      };
    } else if (def.date_histogram) {
      const zone = def.date_histogram.time_zone || 'UTC';
      const days = new Map<number, FakeDoc[]>();
      for (const d of docs) {
        for (const v of valuesOf(d._source, def.date_histogram.field)) {
          const day = startOfDay(time(v), zone);
          const g = days.get(day);
          if (g) g.push(d);
          else days.set(day, [d]);
        }
      }
      output[name] = {
        buckets: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([key, ds]) => ({ key, doc_count: ds.length, ...aggregate(ds, def.aggs) })),
      };
    } else {
      throw new Error(`fake-indexer: unsupported aggregation ${name}`);
    }
  }
  return output;
};

export const createFakeIndexer = (
  initial: FakeDoc[],
  options: { user?: any; clock?: () => number; failShards?: (body: any, index?: string) => number; latencyMs?: number; missingIndices?: string[] } = {}
) => {
  if (options.clock) indexNow = options.clock;
  const docs = [...initial];
  const log: { index?: string; body: any; hits: number; params: any }[] = [];
  const matchingIndex = (patron: string | undefined, index: string) =>
    !patron || patron.split(',').some(p => new RegExp(`^${p.trim().replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test(index));

  const maps = (index: string, field: string) =>
    !field.startsWith('data.') || docs.some(d => d._index === index && valuesOf(d._source, field).length > 0);
  const checkOrder = (index: string | undefined, sort: any[]) => {
    const indices = [...new Set(docs.map(d => d._index))].filter(i => matchingIndex(index, i));
    for (const s of sort) {
      const [field, o]: [string, any] = Object.entries(s)[0] as any;
      if (o && typeof o === 'object' && o.unmapped_type) continue;
      const unmapped = indices.find(i => !maps(i, field));
      if (unmapped) {
        const motive = `No mapping found for [${field}] in order to sort on`;
        throw Object.assign(new Error(`search_phase_execution_exception: [query_shard_exception] Reason: ${motive}`), {
          name: 'ResponseError',
          statusCode: 400,
          meta: { statusCode: 400, body: { error: { type: 'search_phase_execution_exception', root_cause: [{ type: 'query_shard_exception', reason: motive, index: unmapped }] }, status: 400 } },
        });
      }
    }
  };

  const search = async (params: any) => {
    const { index, body } = params;
    if (options.latencyMs) await new Promise(resolve => setTimeout(resolve, options.latencyMs));
    if (options.clock) indexNow = options.clock;
    if (options.missingIndices?.includes(index) && !params.ignore_unavailable) {
      throw Object.assign(new Error(`index_not_found_exception: no such index [${index}]`), {
        statusCode: 404,
        meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception', index }, status: 404 } },
      });
    }
    checkOrder(index, body?.sort || []);
    let candidates = docs.filter(d => matchingIndex(index, d._index) && matches(d, body?.query));
    const sort = body?.sort || [];
    if (sort.length) candidates = sorts(candidates, sort);
    if (body?.search_after) {
      const keys = sort.map(orderOf);
      const after = body.search_after;
      candidates = candidates.filter(d => {
        for (let i = 0; i < keys.length; i++) {
          const r = compare(orderValue(d, keys[i].field), after[i], keys[i].desc);
          if (r) return r > 0;
        }
        return false;
      });
    }
    const from = body?.from || 0;
    const size = body?.size ?? 10;
    const pagina = candidates.slice(from, from + size);
    log.push({ index, body, hits: pagina.length, params });
    const failed = options.failShards ? options.failShards(body, index) : 0;
    return {
      body: {
        took: 1,
        timed_out: false,
        _shards: { total: 10, successful: 10 - failed, skipped: 0, failed: failed },
        hits: {
          total: { value: candidates.length, relation: 'eq' },
          hits: pagina.map(d => ({
            _id: d._id,
            _index: d._index,
            _source: pickSource(d._source, body?._source),
            sort: sort.length ? sort.map((s: any) => orderValue(d, orderOf(s).field)) : undefined,
          })),
        },
        aggregations: body?.aggs ? aggregate(candidates, body.aggs) : undefined,
      },
    };
  };

  return {
    docs,
    log,
    search,
    index: async ({ index, body }: any) => {
      docs.push({ _id: `doc-${docs.length + 1}`, _index: index, _source: body });
      return { body: { result: 'created' } };
    },
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }), putMapping: async () => ({ body: {} }) },
    transport: {
      request: async ({ path }: any) => {
        if (path === '/_plugins/_security/authinfo') return { body: options.user || { user_name: 'ana', roles: ['readall'] } };
        throw Object.assign(new Error('no handler found for uri'), { statusCode: 400 });
      },
    },
  };
};
