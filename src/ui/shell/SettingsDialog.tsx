/**
 * Settings (Ctrl+,): every preference in one place, each with a one-line
 * explanation. Changes apply immediately and are remembered.
 */
import { useState, type ReactNode } from 'react';
import { WIRE_COLORS } from '../../core/model/circuit';
import { LANGUAGES, tr, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { setTheme } from '../commands';
import { confirmDialog } from '../common/Dialog';
import { ModalFrame } from '../common/Dialog';
import { Icon } from '../common/Icon';
import { THEMES, themeInfo, type ThemeInfo } from '../themes';

type Tab = 'general' | 'appearance' | 'canvas' | 'editor' | 'simulation' | 'data';

const TABS: { id: Tab; label: MessageKey; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'canvas', label: 'Canvas & mouse', icon: 'hand' },
  { id: 'editor', label: 'Code editor', icon: 'code' },
  { id: 'simulation', label: 'Simulation', icon: 'play' },
  { id: 'data', label: 'Data', icon: 'history' },
];

/** One setting: name and explanation on one side, the control on the other. */
function Row({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-label">{label}</div>
        <div className="set-desc">{description}</div>
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A miniature of the window in the theme's colours. */
function ThemePreview({ th }: { th: ThemeInfo }) {
  const c = th.swatch;
  return (
    <svg viewBox="0 0 120 72" className="theme-preview" aria-hidden>
      <rect width="120" height="72" rx="6" fill={c.app} />
      <rect x="0" y="0" width="120" height="10" fill={c.panel} />
      <rect x="0" y="10" width="28" height="62" fill={c.panel} />
      <rect x="28" y="10" width="92" height="62" fill={c.canvas} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="5" y={16 + i * 9} width={14 + (i % 2) * 5} height="4" rx="2" fill={c.text} opacity={0.35} />
      ))}
      <rect x="44" y="24" width="34" height="22" rx="3" fill={c.accent} opacity={0.85} />
      <path d="M78 35 H100 V52" fill="none" stroke={c.accent} strokeWidth="2" />
      <circle cx="100" cy="54" r="3" fill={c.text} opacity={0.7} />
      <rect x="86" y="2" width="22" height="6" rx="3" fill={c.accent} />
    </svg>
  );
}

function ThemeGallery() {
  const t = useT();
  const pref = useEditor((s) => s.theme);
  return (
    <div className="theme-grid" role="radiogroup" aria-label={t('Theme')}>
      <button type="button" role="radio" aria-checked={pref === 'system'} className={`theme-card${pref === 'system' ? ' on' : ''}`} onClick={() => setTheme('system')}>
        <span className="theme-split">
          <ThemePreview th={themeInfo('light')} />
          <ThemePreview th={themeInfo('dark')} />
        </span>
        <span className="theme-name">{t('Follow system (light/dark)')}</span>
        <span className="theme-desc">{t('Light or dark, as set in the operating system.')}</span>
      </button>
      {THEMES.map((th) => (
        <button key={th.id} type="button" role="radio" aria-checked={pref === th.id} className={`theme-card${pref === th.id ? ' on' : ''}`} onClick={() => setTheme(th.id)}>
          <ThemePreview th={th} />
          <span className="theme-name">{t(th.label)}</span>
          <span className="theme-desc">{t(th.description)}</span>
        </button>
      ))}
    </div>
  );
}

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 22];

export function SettingsDialog() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('general');
  const s = useEditor();
  const set = s.setPrefs;
  const close = () => useEditor.getState().set({ dialog: null });

  let body: ReactNode = null;
  if (tab === 'general') {
    body = (
      <>
        <Row label={t('Language')} description={t('Language of menus, panels and messages. Arabic uses a right-to-left layout.')}>
          <Segmented value={s.language} label={t('Language')} options={LANGUAGES.map((l) => ({ value: l.id, label: l.native }))} onChange={(language) => set({ language })} />
        </Row>
        <Row label={t('Start screen at launch')} description={t('Open on the start screen with recent projects, templates and examples.')}>
          <Switch checked={s.showStartScreen} label={t('Start screen at launch')} onChange={(showStartScreen) => set({ showStartScreen })} />
        </Row>
        <Row label={t('Sound')} description={t('Play the tones of buzzers and speakers while simulating.')}>
          <Switch checked={s.sound} label={t('Sound')} onChange={(sound) => set({ sound })} />
        </Row>
      </>
    );
  } else if (tab === 'appearance') {
    body = (
      <>
        <div className="set-note">{t('The theme colours the whole application, the canvas and the code editor. Parts keep their real colours.')}</div>
        <ThemeGallery />
      </>
    );
  } else if (tab === 'canvas') {
    body = (
      <>
        <Row label={t('Pan with the right mouse button')} description={t('Drag with the right button to move around; a right click without moving still opens the menu.')}>
          <Switch checked={s.rightDragPan} label={t('Pan with the right mouse button')} onChange={(rightDragPan) => set({ rightDragPan })} />
        </Row>
        <Row label={t('Part info on hover')} description={t('Resting the mouse on a part shows what it is and what it is for. F1 opens its page in the parts guide.')}>
          <Switch checked={s.hoverCards} label={t('Part info on hover')} onChange={(hoverCards) => set({ hoverCards })} />
        </Row>
        <Row label={t('Show grid')} description={t('Dots every 0.1 inch (the breadboard pitch).')}>
          <Switch checked={s.showGrid} label={t('Show grid')} onChange={(showGrid) => set({ showGrid })} />
        </Row>
        <Row label={t('Snap to grid')} description={t('Parts and wire bends land on the 0.1 inch grid, so legs line up with breadboard holes.')}>
          <Switch checked={s.snap} label={t('Snap to grid')} onChange={(snap) => set({ snap })} />
        </Row>
        <Row label={t('Colour of new wires')} description={t('Power and ground wires are coloured red and black automatically.')}>
          <div className="set-swatches">
            {WIRE_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`swatch${s.wireColor === c.value ? ' active' : ''}`}
                style={{ background: c.value }}
                aria-label={tr(c.label)}
                title={tr(c.label)}
                onClick={() => set({ wireColor: c.value })}
              />
            ))}
          </div>
        </Row>
        <Row label={t('Show voltages on wires')} description={t('While simulating, each net shows its voltage on its longest wire (key V).')}>
          <Switch checked={s.showVoltages} label={t('Show voltages on wires')} onChange={(showVoltages) => set({ showVoltages })} />
        </Row>
        <Row label={t('Show logic levels on pins')} description={t('While simulating, chip and board pins are marked high, low or floating.')}>
          <Switch checked={s.showLogicLevels} label={t('Show logic levels on pins')} onChange={(showLogicLevels) => set({ showLogicLevels })} />
        </Row>
      </>
    );
  } else if (tab === 'editor') {
    body = (
      <>
        <Row label={t('Font size')} description={t('Size of the code in the editor.')}>
          <select className="tb-select" value={s.editorFontSize} aria-label={t('Font size')} onChange={(e) => set({ editorFontSize: Number(e.target.value) })}>
            {FONT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('Wrap long lines')} description={t('Long lines continue on the next line instead of scrolling sideways.')}>
          <Switch checked={s.editorWordWrap} label={t('Wrap long lines')} onChange={(editorWordWrap) => set({ editorWordWrap })} />
        </Row>
      </>
    );
  } else if (tab === 'simulation') {
    body = (
      <>
        <Row label={t('Clear the serial monitor on run')} description={t('Start every simulation with an empty serial monitor.')}>
          <Switch checked={s.serialClearOnRun} label={t('Clear the serial monitor on run')} onChange={(serialClearOnRun) => set({ serialClearOnRun })} />
        </Row>
        <Row label={t('Time stamps in the serial monitor')} description={t('Prefix each received line with the simulation time.')}>
          <Switch checked={s.serialTimestamps} label={t('Time stamps in the serial monitor')} onChange={(serialTimestamps) => set({ serialTimestamps })} />
        </Row>
      </>
    );
  } else {
    body = (
      <>
        <Row label={t('Recent projects')} description={t('{n} projects in File › Open Recent.', { n: s.recentProjects.length })}>
          <button className="btn" disabled={!s.recentProjects.length} onClick={() => s.forgetProject()}>
            <Icon name="trash" /> {t('Clear list')}
          </button>
        </Row>
        <Row label={t('Reset settings')} description={t('Restore every setting to its default. Your language, favourite parts and recent projects are kept.')}>
          <button
            className="btn danger"
            onClick={async () => {
              if (await confirmDialog({ title: t('Reset all settings?'), message: t('Every setting returns to its default value.'), confirmLabel: t('Reset'), danger: true })) {
                useEditor.getState().resetPrefs();
              }
            }}
          >
            <Icon name="reset" /> {t('Reset')}
          </button>
        </Row>
      </>
    );
  }

  return (
    <ModalFrame title={t('Settings')} onClose={close} footer={<button className="btn primary" onClick={close}>{t('Done')}</button>}>
      <div className="settings">
        <nav className="settings-nav" aria-label={t('Settings')}>
          {TABS.map((x) => (
            <button key={x.id} className={`settings-tab${tab === x.id ? ' on' : ''}`} aria-current={tab === x.id} onClick={() => setTab(x.id)}>
              <Icon name={x.icon} />
              {t(x.label)}
            </button>
          ))}
        </nav>
        <div className="settings-body">{body}</div>
      </div>
    </ModalFrame>
  );
}
