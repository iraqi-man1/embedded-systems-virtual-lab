/**
 * Floating toolbar shown next to the selected wire(s): colour swatches
 * (bulk recolour for multi-selection), label, auto-route, straighten,
 * recolour the whole net, delete.
 */
import { useEffect, useState } from 'react';
import { WIRE_COLORS } from '../../core/model/circuit';
import { tr } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { Icon } from '../common/Icon';
import { DropdownMenu, MenuLabel, MenuSwatches } from '../common/Menu';
import { AnchoredPopover, type ScreenRect } from '../common/Popover';
import { Tip } from '../common/Tooltip';
import { autoRouteWires, clearWirePoints, deleteSelection, setNetWireColor, setWireColor } from './actions';

export function WireToolbar({ anchor, ids }: { anchor: ScreenRect; ids: string[] }) {
  const t = useT();
  const wires = useProject((s) => s.project.circuit.wires);
  const selected = wires.filter((w) => ids.includes(w.id));
  const single = selected.length === 1 ? selected[0] : null;
  const colors = new Set(selected.map((w) => w.color));
  const current = colors.size === 1 ? [...colors][0] : undefined;
  const [label, setLabel] = useState(single?.label ?? '');
  useEffect(() => setLabel(single?.label ?? ''), [single?.id, single?.label]);
  if (!selected.length) return null;
  const commitLabel = () => {
    if (!single || (single.label ?? '') === label) return;
    useProject.getState().edit((c) => {
      const w = c.wires.find((x) => x.id === single.id);
      if (w) w.label = label.trim() || undefined;
    });
  };
  return (
    <AnchoredPopover anchor={anchor} side="top" className="float-bar" sideOffset={10}>
      <div className="float-swatches" role="group" aria-label={t('Wire colour')}>
        {WIRE_COLORS.map((c, i) => (
          <Tip key={c.value} content={tr(c.label)} shortcut={i < 9 ? String(i + 1) : undefined} side="top" direct>
            <button className={`swatch${current === c.value ? ' active' : ''}`} style={{ background: c.value }} aria-label={tr(c.label)} onClick={() => setWireColor(ids, c.value)} />
          </Tip>
        ))}
      </div>
      <div className="divider" />
      {single && (
        <input
          className="input float-label"
          placeholder={t('Label')}
          aria-label={t('Wire label')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLabel(single.label ?? '');
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      )}
      <Tip content={t('Auto-route around parts')}>
        <button className="icon-btn" aria-label={t('Auto-route')} onClick={() => autoRouteWires(ids)}>
          <Icon name="route" />
        </button>
      </Tip>
      <Tip content={t('Straighten (remove bends)')}>
        <button className="icon-btn" aria-label={t('Straighten')} disabled={!selected.some((w) => w.points.length)} onClick={() => clearWirePoints(ids)}>
          <Icon name="minus" />
        </button>
      </Tip>
      {single && (
        <Tip content={t('Colour every wire on this net')}>
          <DropdownMenu
            align="center"
            trigger={
              <button className="icon-btn" aria-label={t('Colour whole net')}>
                <Icon name="palette" />
              </button>
            }
          >
            <MenuLabel>{t('Every wire on this net')}</MenuLabel>
            <MenuSwatches colors={WIRE_COLORS} onPick={(c) => setNetWireColor(single.id, c)} />
          </DropdownMenu>
        </Tip>
      )}
      <Tip content={t('Delete')} shortcut="Del">
        <button className="icon-btn danger" aria-label={t('Delete wire')} onClick={deleteSelection}>
          <Icon name="trash" />
        </button>
      </Tip>
    </AnchoredPopover>
  );
}

export const useWireToolbarVisible = () =>
  useEditor((s) => s.selectedWires.length > 0 && s.selectedComponents.length === 0 && !s.wiring && s.tool === 'select');
