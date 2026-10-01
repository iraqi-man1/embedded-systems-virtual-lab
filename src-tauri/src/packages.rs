//! Discovery of third-party component packages.
//!
//! A package is a directory under `<app data>/packages/<name>/` containing a
//! `package.json` that follows the `ComponentPackage` JSON schema documented
//! in `docs/03-component-packages.md`. The frontend validates and registers it.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct DiscoveredPackage {
    pub path: String,
    pub manifest: String,
}

pub fn packages_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("packages"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_component_packages(app: AppHandle) -> Result<Vec<DiscoveredPackage>, String> {
    let dir = packages_dir(&app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }
    let mut found = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let manifest = entry.path().join("package.json");
        if manifest.is_file() {
            if let Ok(text) = fs::read_to_string(&manifest) {
                found.push(DiscoveredPackage {
                    path: entry.path().display().to_string(),
                    manifest: text,
                });
            }
        }
    }
    Ok(found)
}

#[derive(Serialize)]
pub struct AppPaths {
    pub app_data: String,
    pub packages: String,
    pub toolchain: String,
}

#[tauri::command]
pub fn app_paths(app: AppHandle) -> Result<AppPaths, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(AppPaths {
        app_data: data.display().to_string(),
        packages: packages_dir(&app)?.display().to_string(),
        toolchain: crate::toolchain::toolchain_root(&app)?.display().to_string(),
    })
}
