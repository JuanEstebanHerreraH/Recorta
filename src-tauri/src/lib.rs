// Toda la app vive en la parte web (carpeta dist/, incluida dentro del ejecutable).
// Aquí solo se crea la ventana con la configuración de tauri.conf.json.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Recorta");
}
