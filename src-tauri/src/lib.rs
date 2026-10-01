//! Embedded Systems Virtual Lab — native backend.
//!
//! The Rust side owns everything that needs operating-system access:
//! firmware toolchains (PlatformIO), project files, and discovery of
//! third-party component packages. Simulation itself runs in the WebView
//! (Web Worker) so that it stays close to the visual layer; native engines
//! such as ngspice and Renode will be added here behind their own modules.

mod packages;
mod process;
mod project_io;
mod toolchain;

use std::sync::Mutex;

pub struct AppState {
    /// Serialises firmware builds: PlatformIO build directories are shared
    /// per board so incremental builds stay fast.
    pub build_lock: Mutex<()>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            build_lock: Mutex::new(()),
        })
        .invoke_handler(tauri::generate_handler![
            toolchain::toolchain_status,
            toolchain::toolchain_install,
            toolchain::compile_firmware,
            project_io::read_text_file,
            project_io::write_text_file,
            packages::list_component_packages,
            packages::app_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Embedded Systems Virtual Lab");
}
