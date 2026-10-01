//! Project file IO. Paths come from native open/save dialogs in the UI.
//! Autosave (crash recovery) lives in `<app data>/autosave/`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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
}
