fn get_drivebase_dir() -> std::path::PathBuf {
  let app_data = std::env::var("APPDATA")
    .or_else(|_| std::env::var("USERPROFILE"))
    .unwrap_or_else(|_| ".".to_string());
  let dir = std::path::Path::new(&app_data).join("DriveBase");
  if !dir.exists() {
    let _ = std::fs::create_dir_all(&dir);
  }
  dir
}

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
    Ok(None)
  }
}

#[tauri::command]
fn save_business_sqlite(business_id: u32, bytes: Vec<u8>) -> Result<String, String> {
  let db_dir = get_drivebase_dir().join("databases");
  if !db_dir.exists() {
    std::fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create databases directory: {}", e))?;
  }
  let target_path = db_dir.join(format!("business_{}.sqlite3", business_id));
  let tmp_path = db_dir.join(format!("business_{}.sqlite3.tmp", business_id));
  let bak_path = db_dir.join(format!("business_{}.sqlite3.bak", business_id));

  std::fs::write(&tmp_path, &bytes).map_err(|e| format!("Failed to write temp database: {}", e))?;

  if target_path.exists() {
    let _ = std::fs::copy(&target_path, &bak_path);
  }

  std::fs::rename(&tmp_path, &target_path).map_err(|e| format!("Failed to finalize database: {}", e))?;
  Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_local_database_info(business_id: u32) -> Result<serde_json::Value, String> {
  let target_path = get_drivebase_dir().join("databases").join(format!("business_{}.sqlite3", business_id));
  if !target_path.exists() {
    return Ok(serde_json::json!({
      "exists": false,
      "path": target_path.to_string_lossy().to_string()
    }));
  }

  let metadata = std::fs::metadata(&target_path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
  let size_bytes = metadata.len();
  let modified = metadata.modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0);

  Ok(serde_json::json!({
    "exists": true,
    "path": target_path.to_string_lossy().to_string(),
    "size_bytes": size_bytes,
    "last_modified": modified
  }))
}

#[tauri::command]
fn save_media_file(relative_path: String, bytes: Vec<u8>) -> Result<String, String> {
  let clean_rel = relative_path.trim_start_matches('/').replace('\\', "/");
  if clean_rel.contains("..") {
    return Err("Invalid relative path traversal".to_string());
  }
  let media_dir = get_drivebase_dir().join("media");
  let target_path = media_dir.join(&clean_rel);

  if let Some(parent) = target_path.parent() {
    if !parent.exists() {
      std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create media directory: {}", e))?;
    }
  }

  std::fs::write(&target_path, &bytes).map_err(|e| format!("Failed to write media file: {}", e))?;
  Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_cached_media_files() -> Result<Vec<String>, String> {
  let media_dir = get_drivebase_dir().join("media");
  if !media_dir.exists() {
    return Ok(Vec::new());
  }
  let mut files = Vec::new();
  for entry in walkdir::WalkDir::new(&media_dir).into_iter().filter_map(|e| e.ok()) {
    if entry.file_type().is_file() {
      if let Ok(rel) = entry.path().strip_prefix(&media_dir) {
        files.push(rel.to_string_lossy().replace('\\', "/"));
      }
    }
  }
  Ok(files)
}

#[tauri::command]
fn open_local_data_folder() -> Result<(), String> {
  let path = get_drivebase_dir();
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .arg(&path)
      .spawn()
      .map_err(|e| format!("Failed to open folder: {}", e))?;
  }
  Ok(())
}

#[tauri::command]
fn export_disaster_recovery_zip(business_id: u32) -> Result<Option<String>, String> {
  let db_path = get_drivebase_dir().join("databases").join(format!("business_{}.sqlite3", business_id));
  if !db_path.exists() {
    return Err("Local database file not found. Please sync first.".to_string());
  }

  let file_path = rfd::FileDialog::new()
    .set_file_name(&format!("drivebase_disaster_recovery_business_{}.zip", business_id))
    .add_filter("ZIP Archive (*.zip)", &["zip"])
    .save_file();

  let dest_path = match file_path {
    Some(p) => p,
    None => return Ok(None),
  };

  let file = std::fs::File::create(&dest_path).map_err(|e| format!("Failed to create destination zip: {}", e))?;
  let mut zip = zip::ZipWriter::new(file);
  let options = zip::write::SimpleFileOptions::default()
    .compression_method(zip::CompressionMethod::Deflated);

  // 1. Add SQLite file
  zip.start_file(format!("data/business_{}.sqlite3", business_id), options)
    .map_err(|e| format!("Failed to add database to zip: {}", e))?;
  let mut db_file = std::fs::File::open(&db_path).map_err(|e| format!("Failed to read database: {}", e))?;
  std::io::copy(&mut db_file, &mut zip).map_err(|e| format!("Failed to write database to zip: {}", e))?;

  // 2. Add local media files
  let media_dir = get_drivebase_dir().join("media");
  if media_dir.exists() {
    for entry in walkdir::WalkDir::new(&media_dir).into_iter().filter_map(|e| e.ok()) {
      if entry.file_type().is_file() {
        if let Ok(rel) = entry.path().strip_prefix(&media_dir) {
          let entry_name = format!("media/{}", rel.to_string_lossy().replace('\\', "/"));
          let _ = zip.start_file(&entry_name, options);
          if let Ok(mut src) = std::fs::File::open(entry.path()) {
            let _ = std::io::copy(&mut src, &mut zip);
          }
        }
      }
    }
  }

  zip.finish().map_err(|e| format!("Failed to finalize zip archive: {}", e))?;
  Ok(Some(dest_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_starmoney_csv_file() -> Result<Option<String>, String> {
  let file_path = rfd::FileDialog::new()
    .set_title("Select StarMoney CSV Export File")
    .add_filter("CSV File (*.csv;*.txt)", &["csv", "txt"])
    .add_filter("All Files (*.*)", &["*"])
    .pick_file();

  Ok(file_path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn check_starmoney_csv_file(file_path: String) -> Result<serde_json::Value, String> {
  let path = std::path::Path::new(&file_path);
  if !path.exists() {
    return Ok(serde_json::json!({
      "exists": false,
      "path": file_path
    }));
  }

  let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
  let size_bytes = metadata.len();
  let modified = metadata.modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0);

  Ok(serde_json::json!({
    "exists": true,
    "path": file_path,
    "size_bytes": size_bytes,
    "last_modified": modified
  }))
}

#[tauri::command]
fn read_starmoney_csv_file(file_path: String) -> Result<serde_json::Value, String> {
  let path = std::path::Path::new(&file_path);
  if !path.exists() {
    return Ok(serde_json::json!({
      "exists": false,
      "path": file_path
    }));
  }

  let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
  let size_bytes = metadata.len();
  let modified = metadata.modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0);

  let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file bytes: {}", e))?;

  Ok(serde_json::json!({
    "exists": true,
    "path": file_path,
    "size_bytes": size_bytes,
    "last_modified": modified,
    "bytes": bytes
  }))
}

#[tauri::command]
fn save_starmoney_sync_config(config_json: String) -> Result<(), String> {
  let cfg_dir = get_drivebase_dir().join("config");
  if !cfg_dir.exists() {
    std::fs::create_dir_all(&cfg_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
  }
  let cfg_path = cfg_dir.join("starmoney_sync.json");
  std::fs::write(&cfg_path, config_json.as_bytes()).map_err(|e| format!("Failed to write config: {}", e))?;
  Ok(())
}

#[tauri::command]
fn load_starmoney_sync_config() -> Result<String, String> {
  let cfg_path = get_drivebase_dir().join("config").join("starmoney_sync.json");
  if !cfg_path.exists() {
    return Ok("[]".to_string());
  }
  std::fs::read_to_string(&cfg_path).map_err(|e| format!("Failed to read config: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
      save_file_with_dialog,
      save_file_to_downloads,
      show_in_folder,
      save_business_sqlite,
      get_local_database_info,
      save_media_file,
      get_cached_media_files,
      open_local_data_folder,
      export_disaster_recovery_zip,
      pick_starmoney_csv_file,
      check_starmoney_csv_file,
      read_starmoney_csv_file,
      save_starmoney_sync_config,
      load_starmoney_sync_config
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
