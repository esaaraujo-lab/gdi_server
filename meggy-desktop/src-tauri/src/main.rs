// ★ v1.4.3: Hide the CMD/console window on Windows in release builds.
// In debug mode, keep the console for debugging output.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meggy_desktop_lib::run()
}
