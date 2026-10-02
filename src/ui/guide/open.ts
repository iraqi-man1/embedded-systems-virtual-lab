/** Opening the parts guide, from F1, menus, the hover card or the library. */
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';

let hovered: string | null = null;

/** The part type whose hover card is showing (F1 opens its page). */
export const setHoveredPart = (type: string | null) => void (hovered = type);

/** Opens the guide on a part, or on the overview. */
export function openGuide(type: string | null = null) {
  const ed = useEditor.getState();
  const back = ed.page === 'guide' ? ed.guideReturn : ed.page;
  ed.set({ page: 'guide', guideType: type, guideReturn: back, wiring: null, contextMenu: null });
}

/** F1: the part under the hover card, else the selected part, else the overview. */
export function openGuideForContext() {
  const ed = useEditor.getState();
  let type = ed.page ? null : hovered;
  if (!type && !ed.page && ed.selectedComponents.length === 1) {
    type = useProject.getState().project.circuit.components.find((c) => c.id === ed.selectedComponents[0])?.type ?? null;
  }
  openGuide(type);
}

/** Leaves the guide for the page it was opened from. */
export function closeGuide() {
  const ed = useEditor.getState();
  ed.set({ page: ed.guideReturn, guideType: null });
}
