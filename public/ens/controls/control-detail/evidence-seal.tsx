import React from 'react';

import type { ENSEvidenceResult } from '../../../../common/ens/core/evaluation/types';
import type { ENSCompliance } from '../../../../common/ens/maturity/compliance-level';
import { MaturitySeal } from '../../ui/maturity-seal';

// The CMM reading of one evidence: across machines, the share of machines that meet it; on one
// machine, the count of items it judged when it counts them.
export const evidenceCompliance = (evidence: ENSEvidenceResult): { compliance?: ENSCompliance; detail?: string } => {
  if (evidence.compliance) {
    const machines = evidence.byMachine || [];
    const met = machines.filter(m => m.status === 'CUMPLE').length;
    const applicable = machines.filter(m => m.status !== 'NO_APLICA').length;
    return { compliance: evidence.compliance, detail: applicable ? `${met}/${applicable} activos` : undefined };
  }
  const tally = evidence.tally;
  const args = evidence.reasonArgs || {};
  if (tally?.level === undefined || args.required === undefined) return {};
  return {
    compliance: { percent: tally.percent, level: tally.level, required: Number(args.required), category: String(args.category ?? ''), status: evidence.status },
    detail: `${tally.met}/${tally.total} elementos`,
  };
};

export const EvidenceSeal = ({ evidence }: { evidence: ENSEvidenceResult }) => {
  const { compliance, detail } = evidenceCompliance(evidence);
  return <MaturitySeal status={evidence.status} compliance={compliance} detail={detail} />;
};
