//! Project file IO. Paths come from native open/save dialogs in the UI.
//! Autosave (crash recovery) lives in `<app data>/autosave/`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// First command-line argument naming an existing project file (double-clicked
/// `.evlab` file, "Open with…", or a second launch forwarded to this instance).
/// Relative paths resolve against `cwd`.
pub fn project_arg<I: IntoIterator<Item = String>>(args: I, cwd: &Path) -> Option<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(&a);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        })
        .find(|p| {
            p.extension().is_some_and(|e| e.eq_ignore_ascii_case("evlab")) && p.is_file()
        })
        .map(|p| p.to_string_lossy().into_owned())
}

/// Project file the application was launched with; handed to the UI once.
#[tauri::command]
pub fn take_launch_file(state: tauri::State<'_, crate::AppState>) -> Option<String> {
    state.launch_file.lock().ok()?.take()
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &contents)
}

/// Writes to a temporary sibling first so a crash never leaves a truncated file.
fn write_atomic(target: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, contents).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, target).map_err(|e| format!("Cannot replace {}: {e}", target.display()))
}

fn autosave_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("autosave"))
        .map_err(|e| e.to_string())
}

const AUTOSAVE_PROJECT: &str = "current.evlab";
const AUTOSAVE_META: &str = "current.meta.json";

#[derive(Serialize)]
pub struct Autosave {
    pub contents: String,
    /// JSON written by the UI: source path, time, project name.
    pub meta: String,
}

/// Stores the unsaved project for crash recovery (project first, then its metadata).
#[tauri::command]
pub fn autosave_write(app: AppHandle, contents: String, meta: String) -> Result<(), String> {
    let dir = autosave_dir(&app)?;
    write_atomic(&dir.join(AUTOSAVE_PROJECT), &contents)?;
    write_atomic(&dir.join(AUTOSAVE_META), &meta)
}

#[tauri::command]
pub fn autosave_read(app: AppHandle) -> Result<Option<Autosave>, String> {
    let dir = autosave_dir(&app)?;
    read_autosave(&dir)
}

fn read_autosave(dir: &Path) -> Result<Option<Autosave>, String> {
    let project = dir.join(AUTOSAVE_PROJECT);
    if !project.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&project).map_err(|e| e.to_string())?;
    let meta = fs::read_to_string(dir.join(AUTOSAVE_META)).unwrap_or_else(|_| "{}".into());
    Ok(Some(Autosave { contents, meta }))
}

#[tauri::command]
pub fn autosave_clear(app: AppHandle) -> Result<(), String> {
    let dir = autosave_dir(&app)?;
    clear_autosave(&dir)
}

fn clear_autosave(dir: &Path) -> Result<(), String> {
    for name in [AUTOSAVE_PROJECT, AUTOSAVE_META] {
        let p = dir.join(name);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("Cannot remove {}: {e}", p.display()))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autosave_round_trip() {
        let dir = std::env::temp_dir().join(format!("evlab-autosave-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(read_autosave(&dir).unwrap().is_none());
        write_atomic(&dir.join(AUTOSAVE_PROJECT), "{\"format\":1}").unwrap();
        write_atomic(&dir.join(AUTOSAVE_META), "{\"name\":\"x\"}").unwrap();
        let a = read_autosave(&dir).unwrap().unwrap();
        assert_eq!(a.contents, "{\"format\":1}");
        assert_eq!(a.meta, "{\"name\":\"x\"}");
        // Overwrite keeps no temporary files behind.
        write_atomic(&dir.join(AUTOSAVE_PROJECT), "{\"format\":2}").unwrap();
        assert!(!dir.join("current.evlab.tmp").exists());
        clear_autosave(&dir).unwrap();
        assert!(read_autosave(&dir).unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_project_argument() {
        let dir = std::env::temp_dir().join(format!("evlab-arg-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Blink.EVLAB"), "{}").unwrap();
        fs::write(dir.join("notes.txt"), "").unwrap();
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        // Flags, other files and missing projects are skipped; relative paths use cwd.
        let found = project_arg(args(&["--flag", "notes.txt", "missing.evlab", "Blink.EVLAB"]), &dir).unwrap();
        assert_eq!(PathBuf::from(found), dir.join("Blink.EVLAB"));
        assert!(project_arg(args(&["notes.txt"]), &dir).is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
