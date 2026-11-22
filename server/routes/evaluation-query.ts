const EVALUATION_QUERY_FIELDS: Record<string, number> = {
  system: 64,
  agentId: 64,
  controlId: 64,
  include: 16,
  timelineDays: 3,
  timeZone: 64,
  timelineControls: 5,
  retryRefresh: 5,
  from: 8,
  size: 4,
};

interface EvaluationQuerySchemaBuilder {
  object(props: any, options: any): any;
  maybe(type: any): any;
  string(options: any): any;
}

export const buildEvaluationQuerySchema = (schema: EvaluationQuerySchemaBuilder) =>
  schema.object(
    Object.fromEntries(
      Object.entries(EVALUATION_QUERY_FIELDS).map(([field, maxLength]) => [field, schema.maybe(schema.string({ maxLength }))])
    ),
    { unknowns: 'ignore' }
  );
