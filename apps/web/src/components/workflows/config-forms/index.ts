/**
 * Barrel — registers every node-type variant form into the registry
 * as a side-effect of import. `NodeConfigPanel.tsx` imports this file
 * once to populate the registry before dispatching.
 *
 * IFC-031 FU-008 — one file per variant
 */

import { registerConfigForm } from './types';
import { StartConfig } from './StartConfig';
import { ActionConfig } from './ActionConfig';
import { DecisionConfig } from './DecisionConfig';
import { HumanConfig } from './HumanConfig';
import { EndConfig } from './EndConfig';

registerConfigForm('start', StartConfig);
registerConfigForm('action', ActionConfig);
registerConfigForm('decision', DecisionConfig);
registerConfigForm('human', HumanConfig);
registerConfigForm('end', EndConfig);

export { getConfigForm, registerConfigForm, getRegisteredNodeTypes } from './types';
export type { NodeConfigFormProps, NodeConfigFormComponent } from './types';
