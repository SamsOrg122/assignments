// Windows: no console window behind the app in a release build. In a debug
// build the console is where every panic and log line goes, so it stays.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tougather_desktop_lib::run()
}
