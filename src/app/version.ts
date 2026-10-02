/** Application version. package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml carry the same number (checked by a test). */
import { version } from '../../package.json';

export const APP_VERSION: string = version;
