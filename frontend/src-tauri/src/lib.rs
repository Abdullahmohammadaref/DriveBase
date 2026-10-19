#[tauri::command]
fn save_file_to_downloads(filename: String, bytes: Vec<u8>) -> Result<String, String> {
  let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
  let downloads_dir = std::path::Path::new(&home).join("Downloads");
  if !downloads_dir.exists() {
    let _ = std::fs::create_dir_all(&downloads_dir);
  }
  let target_path = downloads_dir.join(&filename);
  std::fs::write(&target_path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
  Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .args(["/select,", &path])
      .spawn()
      .map_err(|e| format!("Failed to open folder: {}", e))?;
  }
  Ok(())
}

#[tauri::command]
fn save_file_with_dialog(filename: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
  let file_path = rfd::FileDialog::new()
    .set_file_name(&filename)
    .add_filter("ZIP Archive (*.zip)", &["zip"])
    .add_filter("All Files (*.*)", &["*"])
    .save_file();

  if let Some(path) = file_path {
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(Some(path.to_string_lossy().to_string()))
  } else {
    // User cancelled the file dialog
    Ok(None)
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      save_file_with_dialog,
      save_file_to_downloads,
      show_in_folder
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
