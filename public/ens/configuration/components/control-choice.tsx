import React from 'react';

import { ENSCatalog } from '../../../../common/ens/catalog';
import { Choice } from '../../ui/choice';

const CONTROL_OPTIONS = ENSCatalog.map(control => ({ value: control.id, text: `${control.id} · ${control.name}` }));

export const ControlChoice = ({ value, onChange }: { value: string; onChange: (controlId: string) => void }) => (
  <Choice legend='Control' options={CONTROL_OPTIONS} value={value} onChange={onChange} />
);
