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

/// Browser shortcuts (F5/Ctrl+R reload, Ctrl+F find, Ctrl+P print, Alt+← back, F12…)
/// would discard or disturb the user's work in a desktop application; the UI
/// binds the keys it needs itself. Debug builds keep them for development.
#[cfg(all(windows, not(debug_assertions)))]
fn disable_browser_accelerators(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            build_lock: Mutex::new(()),
        })
        .setup(|_app| {
            #[cfg(all(windows, not(debug_assertions)))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    disable_browser_accelerators(&window);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toolchain::toolchain_status,
            toolchain::toolchain_install,
            toolchain::compile_firmware,
            project_io::read_text_file,
            project_io::write_text_file,
            project_io::autosave_write,
            project_io::autosave_read,
            project_io::autosave_clear,
            packages::list_component_packages,
            packages::app_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Embedded Systems Virtual Lab");
}
