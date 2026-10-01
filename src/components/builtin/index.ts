/**
 * The built-in component package. It is registered exactly like a
 * third-party package would be — the core has no knowledge of its contents.
 */
import type { ComponentPackage } from '../../core/model/component';
import * as boards from './boards';
import * as proto from './prototyping';
import * as passives from './passives';
import { actuators, communication, displays, ics, instruments, sensors } from './catalog';

const ofModule = (m: Record<string, unknown>) =>
  Object.values(m).filter((v): v is ComponentPackage['components'][number] => !!v && typeof v === 'object' && 'type' in v && 'pins' in v);

export const builtinPackage: ComponentPackage = {
  id: 'evlab.builtin',
  name: 'Embedded Systems Virtual Lab — Core Library',
  version: '0.1.0',
  license: 'MIT (visuals from @wokwi/elements, MIT)',
  description: 'Boards, prototyping, passives, semiconductors, I/O, sensors, actuators and communication modules.',
  components: [
    ...ofModule(boards),
    ...ofModule(proto),
    ...ofModule(passives),
    ...displays,
    ...ics,
    ...sensors,
    ...actuators,
    ...instruments,
    ...communication,
  ],
};
