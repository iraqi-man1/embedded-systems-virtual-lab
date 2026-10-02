/** The parts guide content, by component type. */
import { BASICS } from './basics';
import { CATALOG } from './catalog';
import { IO } from './io';
import { MODULES } from './modules';
import type { GuideEntry } from './types';

export type { BoardPins, GuideEntry, L } from './types';

export const GUIDE: Record<string, GuideEntry> = { ...BASICS, ...IO, ...MODULES, ...CATALOG };

export const guideEntry = (type: string): GuideEntry | undefined => GUIDE[type];
