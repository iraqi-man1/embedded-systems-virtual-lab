/**
 * Floating panels anchored to a screen rectangle rather than a DOM element
 * (a pin under the cursor, the bounding box of selected wires). Rendered in a
 * portal with collision-aware placement, so they flip/shift to stay visible
 * near window edges and are never clipped by the canvas or panels.
 */
import { useMemo, type ReactNode } from 'react';
import * as PO from '@radix-ui/react-popover';
import { mirrorSide } from '../../i18n';
import { COLLISION_PADDING } from './Menu';

export interface ScreenRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface Props {
  /** Anchor in client (viewport) coordinates. */
  anchor: ScreenRect;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  /** Pointer events pass through (tooltips that must not block the canvas). */
  passive?: boolean;
  children: ReactNode;
}

/**
 * Always-open, non-modal floating panel. Visibility is controlled by
 * rendering it or not; it never steals focus and never dismisses itself.
 */
export function AnchoredPopover({ anchor, side = 'top', align = 'center', sideOffset = 8, className = '', passive, children }: Props) {
  const { x, y, width = 0, height = 0 } = anchor;
  // A new virtual element whenever the anchor moves makes the popper re-measure.
  const virtualRef = useMemo(
    () => ({ current: { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width, height }) } }),
    [x, y, width, height],
  );
  return (
    <PO.Root open modal={false}>
      <PO.Anchor virtualRef={virtualRef} />
      <PO.Portal>
        <PO.Content
          className={`${className}${passive ? ' passive-pop' : ''}`}
          side={mirrorSide(side)}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={COLLISION_PADDING}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {children}
        </PO.Content>
      </PO.Portal>
    </PO.Root>
  );
}
