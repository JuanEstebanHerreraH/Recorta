// En la versión final no se abre una consola negra junto a la ventana (Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    recorta_lib::run()
}
