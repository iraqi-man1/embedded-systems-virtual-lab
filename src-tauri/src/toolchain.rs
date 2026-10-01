//! Firmware toolchain service backed by PlatformIO Core.
//!
//! Layout of the toolchain root (app-private, see `toolchain_root`):
//!
//! ```text
//! <root>/penv/       Python virtual environment containing PlatformIO Core
//! <root>/pio-core/   PLATFORMIO_CORE_DIR: platforms, toolchains, frameworks
//! <root>/builds/     one persistent build directory per platform+board, so
//!                    the Arduino core is compiled once and reused (fast,
//!                    incremental, and fully offline after installation)
//! ```

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

use crate::process;
use crate::AppState;

/// Platforms installed (and warmed up) by `toolchain_install`.
const DEFAULT_TARGETS: &[(&str, &str, &str)] = &[("atmelavr", "uno", "arduino")];

/// Libraries pre-fetched during installation so common sketches compile offline.
/// Keep in sync with `src/core/toolchain/libraries.ts`.
const CURATED_LIBRARIES: &[&str] = &[
    "arduino-libraries/Servo@^1.2.2",
    "arduino-libraries/LiquidCrystal@^1.0.7",
    "marcoschwartz/LiquidCrystal_I2C@^1.1.4",
    "adafruit/DHT sensor library@^1.4.6",
    "adafruit/Adafruit Unified Sensor@^1.1.14",
    "adafruit/Adafruit NeoPixel@^1.12.3",
    "adafruit/RTClib@^2.1.4",
    "adafruit/Adafruit SSD1306@^2.5.13",
    "adafruit/Adafruit GFX Library@^1.11.11",
    "adafruit/Adafruit MPU6050@^2.2.6",
    "arduino-libraries/Stepper@^1.1.3",
    "z3t0/IRremote@^4.4.1",
    "chris--a/Keypad@^3.1.1",
    "paulstoffregen/OneWire@^2.3.8",
    "milesburton/DallasTemperature@^3.11.0",
];

pub fn toolchain_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("EVLAB_TOOLCHAIN_DIR") {
        return Ok(PathBuf::from(dir));
    }
    #[cfg(debug_assertions)]
    {
        // During development reuse the repository-local toolchain if present.
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".toolchain");
        if dev.join("penv").exists() {
            return Ok(dev);
        }
    }
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("toolchain"))
        .map_err(|e| e.to_string())
}

fn venv_bin(root: &Path, exe: &str) -> PathBuf {
    if cfg!(windows) {
        root.join("penv").join("Scripts").join(format!("{exe}.exe"))
    } else {
        root.join("penv").join("bin").join(exe)
    }
}

fn pio_command(root: &Path) -> Command {
    let mut cmd = process::command(venv_bin(root, "pio"));
    cmd.env("PLATFORMIO_CORE_DIR", root.join("pio-core"))
        .env("PLATFORMIO_SETTING_ENABLE_TELEMETRY", "No")
        .env("PLATFORMIO_SETTING_CHECK_PLATFORMIO_INTERVAL", "3650")
        .env("PLATFORMIO_DISABLE_PROGRESSBAR", "true")
        .env("PLATFORMIO_NO_ANSI", "true")
        .env("PYTHONIOENCODING", "utf-8");
    cmd
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub installed: bool,
    pub root: String,
    pub pio_version: Option<String>,
    pub platforms: Vec<String>,
}

#[tauri::command]
pub async fn toolchain_status(app: AppHandle) -> Result<ToolchainStatus, String> {
    let root = toolchain_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let pio_version = if venv_bin(&root, "pio").exists() {
            pio_command(&root)
                .arg("--version")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        };
        let mut platforms = vec![];
        if let Ok(entries) = fs::read_dir(root.join("pio-core").join("platforms")) {
            for e in entries.flatten() {
                platforms.push(e.file_name().to_string_lossy().to_string());
            }
        }
        ToolchainStatus {
            installed: pio_version.is_some() && !platforms.is_empty(),
            root: root.display().to_string(),
            pio_version,
            platforms,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

fn find_python() -> Option<Vec<String>> {
    let candidates: &[&[&str]] = if cfg!(windows) {
        &[&["py", "-3"], &["python"], &["python3"]]
    } else {
        &[&["python3"], &["python"]]
    };
    for c in candidates {
        let ok = process::command(c[0])
            .args(&c[1..])
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ok {
            return Some(c.iter().map(|s| s.to_string()).collect());
        }
    }
    None
}

/// Runs a command, streaming every output line to the UI as a progress event.
fn run_streaming(app: &AppHandle, mut cmd: Command, label: &str) -> Result<String, String> {
    let _ = app.emit("toolchain-progress", format!("> {label}"));
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{label}: cannot start: {e}"))?;
    let stderr = child.stderr.take().unwrap();
    let app2 = app.clone();
    let err_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app2.emit("toolchain-progress", line.clone());
            buf.push_str(&line);
            buf.push('\n');
        }
        buf
    });
    let mut out = String::new();
    for line in BufReader::new(child.stdout.take().unwrap()).lines().map_while(Result::ok) {
        let _ = app.emit("toolchain-progress", line.clone());
        out.push_str(&line);
        out.push('\n');
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    out.push_str(&err_thread.join().unwrap_or_default());
    if status.success() {
        Ok(out)
    } else {
        Err(format!("{label} failed ({status})"))
    }
}

#[tauri::command]
pub async fn toolchain_install(app: AppHandle) -> Result<(), String> {
    let root = toolchain_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        if !venv_bin(&root, "python").exists() {
            let py = find_python().ok_or(
                "Python 3 was not found. Install Python 3.9+ from python.org (enable 'Add to PATH') and retry.",
            )?;
            let mut cmd = process::command(&py[0]);
            cmd.args(&py[1..]).arg("-m").arg("venv").arg(root.join("penv"));
            run_streaming(&app, cmd, "Creating Python environment")?;
        }
        let mut pip = process::command(venv_bin(&root, "python"));
        pip.args(["-m", "pip", "install", "--upgrade", "platformio"]);
        run_streaming(&app, pip, "Installing PlatformIO Core")?;

        for (platform, board, framework) in DEFAULT_TARGETS {
            let mut cmd = pio_command(&root);
            cmd.args(["pkg", "install", "--global", "--platform", platform]);
            run_streaming(&app, cmd, &format!("Installing platform {platform}"))?;
            // A warm-up build downloads the framework/toolchain packages and
            // pre-compiles the core, so the first user build is fast and offline.
            let req = CompileRequest {
                platform: platform.to_string(),
                board: board.to_string(),
                framework: framework.to_string(),
                files: vec![SourceFile {
                    name: "sketch.ino".into(),
                    content: "void setup() {}\nvoid loop() {}\n".into(),
                }],
                build_flags: vec![],
                lib_deps: CURATED_LIBRARIES.iter().map(|s| s.to_string()).collect(),
            };
            let _ = app.emit("toolchain-progress", format!("> Warm-up build for {board} (downloads libraries)"));
            let res = compile_blocking(&root, &req)?;
            if !res.success {
                return Err(format!("Warm-up build for {board} failed:\n{}", res.log));
            }
        }
        let _ = app.emit("toolchain-progress", "Toolchain ready.".to_string());
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize, Clone)]
pub struct SourceFile {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompileRequest {
    pub platform: String,
    pub board: String,
    pub framework: String,
    pub files: Vec<SourceFile>,
    #[serde(default)]
    pub build_flags: Vec<String>,
    #[serde(default)]
    pub lib_deps: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub severity: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    pub success: bool,
    pub hex: Option<String>,
    pub log: String,
    pub diagnostics: Vec<Diagnostic>,
    pub flash_bytes: Option<u32>,
    pub ram_bytes: Option<u32>,
    pub duration_ms: u64,
}

fn is_identifier(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn is_safe_source_name(name: &str) -> bool {
    let allowed = [".ino", ".cpp", ".c", ".h", ".hpp", ".S"];
    !name.contains(['/', '\\', ':'])
        && !name.starts_with('.')
        && allowed.iter().any(|ext| name.ends_with(ext))
}

fn is_safe_ini_value(s: &str) -> bool {
    !s.contains(['\n', '\r'])
}

pub fn compile_blocking(root: &Path, req: &CompileRequest) -> Result<CompileResult, String> {
    let started = Instant::now();
    if !is_identifier(&req.platform) || !is_identifier(&req.board) || !is_identifier(&req.framework) {
        return Err("Invalid platform/board/framework identifier".into());
    }
    if req.files.is_empty() {
        return Err("No source files".into());
    }
    for f in &req.files {
        if !is_safe_source_name(&f.name) {
            return Err(format!("Unsupported source file name: {}", f.name));
        }
    }
    if !req.build_flags.iter().chain(req.lib_deps.iter()).all(|s| is_safe_ini_value(s)) {
        return Err("Invalid build flag or library entry".into());
    }

    let dir = root.join("builds").join(format!("{}-{}-{}", req.platform, req.board, req.framework));
    let src = dir.join("src");
    fs::create_dir_all(&src).map_err(|e| e.to_string())?;
    // Replace the previous sources; keep `.pio/` so the core stays compiled.
    for entry in fs::read_dir(&src).map_err(|e| e.to_string())?.flatten() {
        if entry.path().is_file() {
            let _ = fs::remove_file(entry.path());
        }
    }
    for f in &req.files {
        fs::write(src.join(&f.name), &f.content).map_err(|e| e.to_string())?;
    }
    let mut ini = format!(
        "[platformio]\nsrc_dir = src\n\n[env:sim]\nplatform = {}\nboard = {}\nframework = {}\n",
        req.platform, req.board, req.framework
    );
    if !req.build_flags.is_empty() {
        ini.push_str(&format!("build_flags = {}\n", req.build_flags.join(" ")));
    }
    if !req.lib_deps.is_empty() {
        ini.push_str("lib_deps =\n");
        for l in &req.lib_deps {
            ini.push_str(&format!("    {l}\n"));
        }
    }
    fs::write(dir.join("platformio.ini"), ini).map_err(|e| e.to_string())?;

    let output = pio_command(root)
        .args(["run", "-e", "sim", "-d"])
        .arg(&dir)
        .output()
        .map_err(|e| format!("Cannot start PlatformIO: {e}. Is the toolchain installed?"))?;
    let mut log = String::from_utf8_lossy(&output.stdout).to_string();
    log.push_str(&String::from_utf8_lossy(&output.stderr));

    let user_files: Vec<&str> = req.files.iter().map(|f| f.name.as_str()).collect();
    let diagnostics = parse_diagnostics(&log, &user_files);
    let hex_path = dir.join(".pio").join("build").join("sim").join("firmware.hex");
    let success = output.status.success() && hex_path.exists();
    let hex = if success { fs::read_to_string(&hex_path).ok() } else { None };

    Ok(CompileResult {
        success,
        hex,
        diagnostics,
        flash_bytes: parse_usage(&log, "Flash"),
        ram_bytes: parse_usage(&log, "RAM"),
        log,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn diag_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?m)^(?P<file>(?:[A-Za-z]:)?[^:\r\n]+):(?P<line>\d+):(?:(?P<col>\d+):)? (?P<sev>fatal error|error|warning|note): (?P<msg>.*?)\r?$")
            .unwrap()
    })
}

/// Parses GCC diagnostics and maps build-directory paths back to user file names.
pub fn parse_diagnostics(log: &str, user_files: &[&str]) -> Vec<Diagnostic> {
    diag_regex()
        .captures_iter(log)
        .map(|c| {
            let raw = c["file"].trim().to_string();
            let base = raw.rsplit(['/', '\\']).next().unwrap_or(&raw).to_string();
            let base = base.strip_suffix(".cpp").filter(|b| b.ends_with(".ino")).map(str::to_string).unwrap_or(base);
            let file = if user_files.contains(&base.as_str()) { base } else { raw };
            let sev = &c["sev"];
            Diagnostic {
                file,
                line: c["line"].parse().unwrap_or(0),
                column: c.name("col").and_then(|m| m.as_str().parse().ok()).unwrap_or(1),
                severity: if sev == "fatal error" { "error".into() } else { sev.into() },
                message: c["msg"].to_string(),
            }
        })
        .collect()
}

fn parse_usage(log: &str, what: &str) -> Option<u32> {
    let re = Regex::new(&format!(r"{what}:.*?used (\d+) bytes")).ok()?;
    re.captures(log)?.get(1)?.as_str().parse().ok()
}

#[tauri::command]
pub async fn compile_firmware(app: AppHandle, request: CompileRequest) -> Result<CompileResult, String> {
    let root = toolchain_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _guard = state.build_lock.lock().map_err(|_| "build lock poisoned".to_string())?;
        compile_blocking(&root, &request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gcc_diagnostics_and_maps_ino() {
        let log = "C:\\x\\builds\\uno\\src\\sketch.ino:5:3: error: 'foo' was not declared in this scope\n\
                   src/helper.cpp:10: warning: unused variable 'x'\n";
        let d = parse_diagnostics(log, &["sketch.ino", "helper.cpp"]);
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].file, "sketch.ino");
        assert_eq!(d[0].line, 5);
        assert_eq!(d[0].column, 3);
        assert_eq!(d[0].severity, "error");
        assert_eq!(d[1].file, "helper.cpp");
        assert_eq!(d[1].column, 1);
    }

    /// Compiles a real sketch with the repository-local toolchain (`.toolchain/`).
    /// Run with `cargo test -- --ignored` after installing PlatformIO there.
    #[test]
    #[ignore]
    fn compiles_blink_with_local_toolchain() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".toolchain");
        let req = CompileRequest {
            platform: "atmelavr".into(),
            board: "uno".into(),
            framework: "arduino".into(),
            files: vec![SourceFile {
                name: "sketch.ino".into(),
                content: "void setup(){pinMode(13,OUTPUT);}
void loop(){digitalWrite(13,!digitalRead(13));delay(100);}
".into(),
            }],
            build_flags: vec![],
            lib_deps: vec![],
        };
        let res = compile_blocking(&root, &req).expect("compile ran");
        assert!(res.success, "{}", res.log);
        assert!(res.hex.unwrap().starts_with(':'));
        assert!(res.flash_bytes.unwrap() > 500);
        // A syntax error is reported as a diagnostic on the user's file.
        let mut bad = req.clone();
        bad.files[0].content = "void setup(){ undefined_call(); }
void loop(){}
".into();
        let res = compile_blocking(&root, &bad).expect("compile ran");
        assert!(!res.success);
        assert!(res.diagnostics.iter().any(|d| d.file == "sketch.ino" && d.line == 1 && d.severity == "error"), "{:?}", res.log);
    }

    #[test]
    fn rejects_unsafe_names() {
        assert!(!is_safe_source_name("../evil.ino"));
        assert!(!is_safe_source_name("a.exe"));
        assert!(is_safe_source_name("sketch.ino"));
        assert!(!is_identifier("uno\n[env]"));
    }
}
