/**
 * Styled tooltips (portal, collision-aware) with optional shortcut hints,
 * replacing native `title` attributes on toolbar controls.
 */
import { useState, type ReactNode } from 'react';
import * as T from '@radix-ui/react-tooltip';
import { COLLISION_PADDING } from './Menu';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </T.Provider>
  );
}

interface TipProps {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Rich card instead of a one-line label. */
  card?: boolean;
  delay?: number;
  /** Use the child itself as the trigger (it must accept a ref and emit pointer events). */
  direct?: boolean;
  /** Keep the tooltip closed (e.g. while the menu it describes is open). */
  suppress?: boolean;
  children: ReactNode;
}

/**
 * Wraps `children` (a single element accepting a ref). Disabled buttons don't
 * emit pointer events, so the trigger is a wrapper span that always does.
 */
export function Tip({ content, shortcut, side = 'bottom', align = 'center', card, delay, direct, suppress, children }: TipProps) {
  const [open, setOpen] = useState(false);
  return (
    <T.Root delayDuration={delay} open={open && !suppress} onOpenChange={setOpen}>
      <T.Trigger asChild>{direct ? children : <span className="tip-trigger">{children}</span>}</T.Trigger>
      <T.Portal>
        <T.Content className={card ? 'tip-card' : 'tip'} side={side} align={align} sideOffset={6} collisionPadding={COLLISION_PADDING}>
          {content}
          {shortcut && <kbd className="tip-kbd">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
