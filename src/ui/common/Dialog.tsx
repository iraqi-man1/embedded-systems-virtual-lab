/**
 * In-app modal dialogs (replacing the browser's confirm/prompt). Callers use
 * the async helpers from anywhere — UI or not — and await the answer:
 *
 *   if ((await askSaveChanges()) === 'cancel') return;
 *   const name = await promptText({ title: 'New file', initial: 'helpers.h' });
 *
 * Requests queue up and are shown one at a time by <DialogHost/>.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Icon } from './Icon';

export interface DialogButton {
  id: string;
  label: string;
  variant?: 'primary' | 'danger' | 'default';
}

interface DialogRequest {
  id: number;
  title: string;
  message?: ReactNode;
  buttons: DialogButton[];
  /** Result when the dialog is dismissed (Esc, ×, click outside). */
  cancelId: string;
  /** Button activated by Enter. */
  defaultId?: string;
  input?: { label?: string; initial: string; placeholder?: string; validate?: (value: string) => string | null };
  resolve: (result: { button: string; value?: string }) => void;
}

const useDialogQueue = create<{ queue: DialogRequest[] }>(() => ({ queue: [] }));
let seq = 0;

function ask(req: Omit<DialogRequest, 'resolve' | 'id'>): Promise<{ button: string; value?: string }> {
  return new Promise((resolve) => {
    useDialogQueue.setState((s) => ({ queue: [...s.queue, { ...req, id: ++seq, resolve }] }));
  });
}

/** A generic choice between buttons; resolves with the id of the button pressed. */
export async function choose(opts: { title: string; message?: ReactNode; buttons: DialogButton[]; cancelId: string; defaultId?: string }): Promise<string> {
  return (await ask(opts)).button;
}

export async function confirmDialog(opts: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  const r = await ask({
    title: opts.title,
    message: opts.message,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: opts.confirmLabel ?? 'OK', variant: opts.danger ? 'danger' : 'primary' },
    ],
    cancelId: 'cancel',
    defaultId: 'ok',
  });
  return r.button === 'ok';
}

export type SaveChoice = 'save' | 'discard' | 'cancel';

/** Save / Don't save / Cancel before an action that would discard unsaved changes. */
export async function askSaveChanges(opts: { title?: string; message?: ReactNode; discardLabel?: string } = {}): Promise<SaveChoice> {
  const r = await ask({
    title: opts.title ?? 'Save changes?',
    message: opts.message ?? 'Your project has unsaved changes. Do you want to save them first?',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'discard', label: opts.discardLabel ?? "Don't save", variant: 'danger' },
      { id: 'save', label: 'Save', variant: 'primary' },
    ],
    cancelId: 'cancel',
    defaultId: 'save',
  });
  return r.button as SaveChoice;
}

export async function promptText(opts: {
  title: string;
  message?: ReactNode;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (value: string) => string | null;
}): Promise<string | null> {
  const r = await ask({
    title: opts.title,
    message: opts.message,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: opts.confirmLabel ?? 'OK', variant: 'primary' },
    ],
    cancelId: 'cancel',
    defaultId: 'ok',
    input: { label: opts.label, initial: opts.initial ?? '', placeholder: opts.placeholder, validate: opts.validate },
  });
  return r.button === 'ok' ? (r.value ?? '') : null;
}

/** Modal frame shared by every dialog in the application. */
export function ModalFrame({
  title,
  small,
  onClose,
  children,
  footer,
  initialFocus,
}: {
  title: string;
  small?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Focus a specific element instead of the first focusable one. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <RD.Root open onOpenChange={(open) => !open && onClose()}>
      <RD.Portal>
        <RD.Overlay className="modal-back" />
        <RD.Content
          className={`modal${small ? ' small' : ''}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            if (initialFocus?.current) {
              e.preventDefault();
              initialFocus.current.focus();
            }
          }}
        >
          <div className="modal-head">
            <RD.Title asChild>
              <h2>{title}</h2>
            </RD.Title>
            <RD.Close className="icon-btn" aria-label="Close">
              <Icon name="x" />
            </RD.Close>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

function QueuedDialog({ req }: { req: DialogRequest }) {
  const [value, setValue] = useState(req.input?.initial ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultRef = useRef<HTMLButtonElement>(null);
  const error = req.input?.validate?.(value) ?? null;
  const finish = (button: string) => {
    if (req.input && button !== req.cancelId && error) return;
    useDialogQueue.setState((s) => ({ queue: s.queue.filter((q) => q !== req) }));
    req.resolve({ button, value: req.input ? value.trim() : undefined });
  };
  useEffect(() => {
    // Select the file stem so typing replaces it (e.g. "helpers" in helpers.h).
    const el = inputRef.current;
    if (el) el.setSelectionRange(0, el.value.lastIndexOf('.') > 0 ? el.value.lastIndexOf('.') : el.value.length);
  }, []);
  return (
    <ModalFrame
      title={req.title}
      small
      onClose={() => finish(req.cancelId)}
      initialFocus={req.input ? inputRef : defaultRef}
      footer={req.buttons.map((b) => (
        <button
          key={b.id}
          ref={b.id === req.defaultId ? defaultRef : undefined}
          className={`btn${b.variant === 'primary' ? ' primary' : b.variant === 'danger' ? ' danger' : ''}`}
          disabled={!!req.input && b.id !== req.cancelId && !!error}
          onClick={() => finish(b.id)}
        >
          {b.label}
        </button>
      ))}
    >
      {req.message && <div className="dialog-message">{req.message}</div>}
      {req.input && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish(req.defaultId ?? req.buttons[req.buttons.length - 1].id);
          }}
        >
          {req.input.label && <label className="dialog-label">{req.input.label}</label>}
          <input
            ref={inputRef}
            className={`input${error && value ? ' invalid' : ''}`}
            value={value}
            placeholder={req.input.placeholder}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
          {error && value && <div className="dialog-error">{error}</div>}
        </form>
      )}
    </ModalFrame>
  );
}

export function DialogHost() {
  const req = useDialogQueue((s) => s.queue[0]);
  return req ? <QueuedDialog key={req.id} req={req} /> : null;
}

/** True while an in-app dialog is waiting for an answer. */
export const dialogOpen = () => useDialogQueue.getState().queue.length > 0;
