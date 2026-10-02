/**
 * File › Version History: the copies the lab kept when the project was run or
 * saved, newest first, with a preview of the circuit and the start of the
 * code; Restore brings one back (after keeping the current version too).
 */
import { useEffect, useMemo, useState } from 'react';
import { historyStore, projectKey, restoreSnapshot, type Snapshot } from '../../app/history';
import { parseProject } from '../../core/project/schema';
import { MAIN_FILE } from '../../core/project/firmware';
import { formatRelative, intlLocale, t } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { confirmDialog, ModalFrame } from '../common/Dialog';
import { Icon } from '../common/Icon';
import { CircuitPreview } from '../home/CircuitPreview';

const REASON = { run: 'Run', save: 'Saved', restore: 'Before restoring' } as const;

/** Time of day (with the date when not today), to tell copies apart. */
function clock(at: number): string {
  const d = new Date(at);
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(intlLocale(), today ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { dateStyle: 'short', timeStyle: 'short' });
}

export function HistoryDialog() {
  useT();
  const key = useProject((s) => projectKey(s.project));
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void historyStore()
      .list(key)
      .then((l) => {
        if (!alive) return;
        setList(l);
        setPicked(l[0]?.id ?? null);
      })
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [key]);
  const snap = list?.find((s) => s.id === picked) ?? null;
  const project = useMemo(() => {
    try {
      return snap ? parseProject(snap.text) : null;
    } catch {
      return null;
    }
  }, [snap]);
  const close = () => useEditor.getState().set({ dialog: null });
  const main = project?.firmware.files.find((f) => f.name === MAIN_FILE.arduino || f.name === MAIN_FILE.micropython) ?? project?.firmware.files[0];

  const restore = async () => {
    if (!snap) return;
    const when = new Date(snap.at).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
    if (!(await confirmDialog({ title: t('Restore this version?'), message: t('The project goes back to how it was on {time}. The current version is kept in the history too.', { time: when }), confirmLabel: t('Restore') })))
      return;
    await restoreSnapshot(snap);
    close();
    useEditor.getState().notify(t('Restored the version of {time}.', { time: when }), 'success');
  };

  return (
    <ModalFrame
      title={t('Version History')}
      wide
      onClose={close}
      footer={
        <>
          <span className="hint" style={{ marginInlineEnd: 'auto' }}>
            {t('A copy is kept each time you run or save the project (the last 30).')}
          </span>
          <button className="btn" onClick={close}>
            {t('Close')}
          </button>
          <button className="btn primary" disabled={!snap} onClick={() => void restore()}>
            <Icon name="history" /> {t('Restore')}
          </button>
        </>
      }
    >
      {list === null ? (
        <div className="empty-note">{t('Loading…')}</div>
      ) : !list.length ? (
        <div className="empty-note">
          <Icon name="history" /> {t('No earlier versions yet: run or save the project to keep one.')}
        </div>
      ) : (
        <div className="history">
          <ul className="history-list" role="listbox" aria-label={t('Version History')}>
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" role="option" aria-selected={s.id === picked} className={`history-item${s.id === picked ? ' on' : ''}`} onClick={() => setPicked(s.id ?? null)}>
                  <span className="history-when">
                    {formatRelative(new Date(s.at).toISOString())} <span className="history-clock ltr">{clock(s.at)}</span>
                  </span>
                  <span className={`chip history-reason ${s.reason}`}>{t(REASON[s.reason])}</span>
                  <span className="history-size">{t('{parts} parts · {wires} wires', { parts: s.parts, wires: s.wires })}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="history-preview">
            <div className="card-canvas">
              <CircuitPreview circuit={project?.circuit ?? null} empty={<span className="card-canvas-note">{t('Empty circuit')}</span>} />
            </div>
            {main && (
              <pre className="history-code ltr">
                <span className="history-file">{main.name}</span>
                {'\n'}
                {main.content.split('\n').slice(0, 14).join('\n')}
              </pre>
            )}
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
