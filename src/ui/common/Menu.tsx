/**
 * Menu primitives shared by the menu bar, toolbar dropdowns and the canvas
 * context menu. They wrap Radix menus, which render into a portal on
 * `document.body`, flip/shift to stay inside the window, and provide keyboard
 * navigation, typeahead, submenus and focus return. Every menu therefore has
 * the same look (`.dropdown` / `.ctxmenu`) and is never clipped by a panel.
 */
import { createContext, useContext, type ReactNode } from 'react';
import * as CM from '@radix-ui/react-context-menu';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as MB from '@radix-ui/react-menubar';
import { t, tr } from '../../i18n';
import { useRtl } from '../../i18n/react';
import { Icon } from './Icon';

type Kind = 'dropdown' | 'context' | 'menubar';
// The three Radix menu families expose structurally identical parts; items must
// come from the family of the enclosing menu, so the menu publishes its kind.
const PRIMS = { dropdown: DM, context: CM, menubar: MB } as unknown as Record<Kind, typeof DM>;
const KindContext = createContext<Kind>('dropdown');
const usePrims = () => PRIMS[useContext(KindContext)];

/** Keeps menus a few pixels away from the window edges. */
export const COLLISION_PADDING = 8;

interface ItemProps {
  label: ReactNode;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
}

export function MenuItem({ label, icon, shortcut, disabled, danger, onSelect }: ItemProps) {
  const P = usePrims();
  return (
    <P.Item className={`item${danger ? ' danger' : ''}`} disabled={disabled} onSelect={onSelect}>
      {icon ? <Icon name={icon} /> : <span className="icon-space" />}
      <span className="text">{label}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </P.Item>
  );
}

export function MenuCheckItem({ label, checked, shortcut, disabled, onSelect }: Omit<ItemProps, 'icon'> & { checked: boolean }) {
  const P = usePrims();
  return (
    <P.CheckboxItem className="item" checked={checked} disabled={disabled} onSelect={onSelect}>
      <span className="icon-space check">{checked ? '✓' : ''}</span>
      <span className="text">{label}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </P.CheckboxItem>
  );
}

export function MenuSeparator() {
  const P = usePrims();
  return <P.Separator className="sep" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  const P = usePrims();
  return <P.Label className="label">{children}</P.Label>;
}

/** A row of colour swatches; each swatch is a keyboard-reachable menu item. */
export function MenuSwatches({ colors, active, onPick }: { colors: { value: string; label: string }[]; active?: string; onPick: (c: string) => void }) {
  const P = usePrims();
  return (
    <div className="swatches" role="group">
      {colors.map((c, i) => (
        <P.Item
          key={c.value}
          className={`swatch${active === c.value ? ' active' : ''}`}
          style={{ background: c.value }}
          aria-label={`${tr(c.label)}${i < 9 ? ` (${i + 1})` : ''}`}
          title={i < 9 ? t('{color} — key {n}', { color: tr(c.label), n: i + 1 }) : tr(c.label)}
          onSelect={() => onPick(c.value)}
        />
      ))}
    </div>
  );
}

export function SubMenu({ label, icon, children, disabled }: { label: ReactNode; icon?: string; children: ReactNode; disabled?: boolean }) {
  const P = usePrims();
  return (
    <P.Sub>
      <P.SubTrigger className="item" disabled={disabled}>
        {icon ? <Icon name={icon} /> : <span className="icon-space" />}
        <span className="text">{label}</span>
        <Icon name="chevron-right" className="sub-arrow" />
      </P.SubTrigger>
      <P.Portal>
        <P.SubContent className="dropdown" sideOffset={2} alignOffset={-5} collisionPadding={COLLISION_PADDING}>
          {children}
        </P.SubContent>
      </P.Portal>
    </P.Sub>
  );
}

/** Dropdown menu opened by `trigger` (rendered as-is; must accept a ref). */
export function DropdownMenu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className = '',
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const dir = useRtl() ? 'rtl' : 'ltr';
  return (
    <KindContext.Provider value="dropdown">
      <DM.Root modal={false} onOpenChange={onOpenChange} dir={dir}>
        <DM.Trigger asChild>{trigger}</DM.Trigger>
        <DM.Portal>
          <DM.Content className={`dropdown ${className}`} align={align} side={side} sideOffset={4} collisionPadding={COLLISION_PADDING} loop>
            {children}
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </KindContext.Provider>
  );
}

/** Context menu: `trigger` receives the right-click; `content` renders when open. */
export function ContextMenu({ trigger, children, onOpenChange }: { trigger: ReactNode; children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const dir = useRtl() ? 'rtl' : 'ltr';
  return (
    <KindContext.Provider value="context">
      <CM.Root onOpenChange={onOpenChange} dir={dir}>
        <CM.Trigger asChild>{trigger}</CM.Trigger>
        <CM.Portal>
          <CM.Content className="ctxmenu" collisionPadding={COLLISION_PADDING} loop onContextMenu={(e) => e.preventDefault()}>
            {children}
          </CM.Content>
        </CM.Portal>
      </CM.Root>
    </KindContext.Provider>
  );
}

/** Application menu bar: hovering switches between open menus, arrows move between them. */
export function MenuBarRoot({ children }: { children: ReactNode }) {
  const dir = useRtl() ? 'rtl' : 'ltr';
  return (
    <KindContext.Provider value="menubar">
      <MB.Root className="menubar-menus" loop dir={dir}>
        {children}
      </MB.Root>
    </KindContext.Provider>
  );
}

export function MenuBarMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <MB.Menu>
      <MB.Trigger className="menu-trigger">{label}</MB.Trigger>
      <MB.Portal>
        <MB.Content className="dropdown" align="start" sideOffset={3} collisionPadding={COLLISION_PADDING} loop>
          {children}
        </MB.Content>
      </MB.Portal>
    </MB.Menu>
  );
}
