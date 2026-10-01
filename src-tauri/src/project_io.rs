//! Project file IO. Paths come from native open/save dialogs in the UI.

use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    // Write to a temporary sibling first so a crash never leaves a truncated project.
    let tmp = target.with_extension("evlab.tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Cannot write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, target).map_err(|e| format!("Cannot replace {path}: {e}"))
}
