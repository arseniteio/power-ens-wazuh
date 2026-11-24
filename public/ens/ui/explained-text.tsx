import React, { createContext, useContext } from 'react';
import { EuiToolTip } from '@elastic/eui';

import { explainLevel, explainParameter, explainedTokens } from '../../../common/ens/catalog/explanations';
import type { ENSExplanation } from '../../../common/ens/catalog/explanations';

const Tip = ({ explanation, children }: { explanation: ENSExplanation; children: React.ReactNode }) => (
  <EuiToolTip
    position='top'
    title={explanation.title}
    content={explanation.text || undefined}
  >
    <span tabIndex={0} style={{ borderBottom: '1px dotted currentColor', cursor: 'help' }}>
      {children}
    </span>
  </EuiToolTip>
);

export const ExplainedControl = createContext<string | undefined>(undefined);

// Every P-X and L level named in a text explains itself on hover: auditors do not have the
// parameter tables or the maturity scale.
export const ExplainedText = ({ text, controlId }: { text: string; controlId?: string }) => {
  const fromContext = useContext(ExplainedControl);
  const control = controlId || fromContext;
  return (
  <>
    {explainedTokens(text).map((token, i) => {
      if (token.kind === 'text') return <React.Fragment key={i}>{token.text}</React.Fragment>;
      const explanation = token.kind === 'parameter' ? explainParameter(control, token.id) : explainLevel(token.level);
      const label = token.kind === 'parameter' ? token.id : token.text;
      return explanation ? (
        <Tip key={i} explanation={explanation}>
          {label}
        </Tip>
      ) : (
        <React.Fragment key={i}>{label}</React.Fragment>
      );
    })}
  </>
  );
};
