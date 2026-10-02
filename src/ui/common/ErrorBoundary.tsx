/**
 * Error boundaries: a part of the interface that fails while drawing shows a
 * message with Try again / Copy details in its own place, and the rest of the
 * application keeps working (without them React clears the whole window).
 */
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { autosaveNow } from '../../app/autosave';
import { errorReport, logError, type LoggedError } from '../../app/errorLog';
import { t, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { Icon } from './Icon';

type Variant =
  /** In place of a panel (canvas, code editor, instruments…). */
  | 'panel'
  /** A thin bar (menu bar, toolbar, status bar). */
  | 'bar'
  /** A full-window page (start screen, parts guide): offers to go back to the editor. */
  | 'page'
  /** The whole application: offers to reload it. */
  | 'app'
  /** Shows nothing: `onError` tidies up (closes the dialog that failed, for example). */
  | 'silent';

interface Props {
  /** The place, as the user knows it ("Canvas", "Parts guide"…). */
  area: MessageKey;
  variant?: Variant;
  /** A new value clears the error (e.g. another part opened in the guide). */
  resetKey?: unknown;
  /** Page variant: leave the page. */
  onBack?: () => void;
  onError?: (entry: LoggedError | null) => void;
  children: ReactNode;
}

interface State {
  entry: LoggedError | null;
  failed: boolean;
  resetKey: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { entry: null, failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { resetKey: props.resetKey, failed: false, entry: null };
    return null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const entry = logError(error, { area: this.props.area, componentStack: info.componentStack ?? undefined });
    this.setState({ entry });
    this.props.onError?.(entry);
  }

  retry = () => this.setState({ failed: false, entry: null });

  render() {
    if (!this.state.failed) return this.props.children;
    const { variant = 'panel', area, onBack } = this.props;
    if (variant === 'silent') return null;
    return <Crash variant={variant} area={area} entry={this.state.entry} onRetry={this.retry} onBack={onBack} />;
  }
}

function Crash({ variant, area, entry, onRetry, onBack }: { variant: Exclude<Variant, 'silent'>; area: MessageKey; entry: LoggedError | null; onRetry: () => void; onBack?: () => void }) {
  useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(errorReport(entry ? [entry] : undefined))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  const title = variant === 'app' ? t('The lab ran into a problem') : t('{area} ran into a problem', { area: t(area) });
  const buttons = (
    <div className="btn-row">
      {variant === 'app' ? (
        <button className="btn primary" onClick={() => void autosaveNow().finally(() => window.location.reload())}>
          <Icon name="reset" /> {t('Reload the lab')}
        </button>
      ) : (
        <button className="btn primary" onClick={onRetry}>
          <Icon name="reset" /> {t('Try again')}
        </button>
      )}
      {onBack && (
        <button className="btn" onClick={onBack}>
          <Icon name="chevron-left" /> {t('Back to the editor')}
        </button>
      )}
      <button className="btn" onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} /> {copied ? t('Copied') : t('Copy details')}
      </button>
    </div>
  );
  if (variant === 'bar')
    return (
      <div className="crash crash-bar" role="alert">
        <Icon name="warning" size={14} />
        <span>{title}</span>
        {buttons}
      </div>
    );
  return (
    <div className={`crash crash-${variant}`} role="alert">
      <div className="crash-card">
        <Icon name="warning" size={26} />
        <h2>{title}</h2>
        <p>
          {variant === 'app'
            ? t('Reloading keeps your work: unsaved changes are offered back when the lab starts again.')
            : t('The rest of the lab keeps working. Try again; if it happens again, copy the details and send them with your report (Help › Report a Problem).')}
        </p>
        {buttons}
        {entry && (
          <details>
            <summary>{t('Details')}</summary>
            <pre className="ltr">{entry.message}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
