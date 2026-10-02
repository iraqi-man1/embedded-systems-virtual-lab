/**
 * Code files in and out of a project: exported to continue in the Arduino
 * IDE (a sketch named after the project) or Thonny (main.py and its modules),
 * and imported from them.
 */
import { fileNameProblem, MAIN_FILE, sourcesFor, type FirmwareLanguage } from './firmware';
import type { Project } from './schema';

/** The project file an imported file becomes: a sketch is the main sketch, main.py the main program; null if it is not code. */
export function importedName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  if (/\.ino$/i.test(base)) return MAIN_FILE.arduino;
  if (base.toLowerCase() === 'main.py') return MAIN_FILE.micropython;
  const m = /^(.+)\.(py|h|hpp|c|cpp)$/i.exec(base);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  const language: FirmwareLanguage = ext === 'py' ? 'micropython' : 'arduino';
  // Characters a file name of the language cannot have become underscores.
  let stem = m[1].replace(language === 'micropython' ? /[^A-Za-z0-9_]/g : /[^A-Za-z0-9_-]/g, '_');
  if (language === 'micropython' && /^\d/.test(stem)) stem = `_${stem}`;
  const name = `${stem}.${ext}`;
  return fileNameProblem(language, name) ? null : name;
}

/** Name of the exported sketch: the project's name as the Arduino IDE accepts it (letters, digits, _ and -). */
export function sketchName(projectName: string): string {
  const stem = projectName
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 60);
  return stem || 'sketch';
}

/** The files of the board's language, the main one first under the name the other tool expects. */
export function exportedFiles(project: Project, language: FirmwareLanguage): { name: string; text: string }[] {
  const files = sourcesFor(language, project.firmware.files);
  const main = files.find((f) => f.name === MAIN_FILE[language]);
  const mainName = language === 'arduino' ? `${sketchName(project.meta.name)}.ino` : MAIN_FILE.micropython;
  return [...(main ? [{ name: mainName, text: main.content }] : []), ...files.filter((f) => f !== main).map((f) => ({ name: f.name, text: f.content }))];
}
