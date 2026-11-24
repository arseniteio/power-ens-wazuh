
export const normalizeAgentIdForScope = (value: string): string => {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

export const isAgentInScope = (agentId: string | undefined, scope: { id: string }[]): boolean =>
  !agentId || scope.some(agent => agent.id === normalizeAgentIdForScope(agentId));

export const describeAgentOutOfScope = (agentId: string): string =>
  `El activo ${agentId} no está en un grupo ENS evaluable.`;
