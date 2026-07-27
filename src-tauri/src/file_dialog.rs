// Native file dialogs (rfd) for markdown import/export, used by the lists module.

use crate::error::AppResult;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct MarkdownFile {
    pub title: String,
    pub content: String,
}

#[tauri::command]
pub fn pick_markdown_file() -> AppResult<String> {
    let file_path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .pick_file();

    match file_path {
        Some(path) => Ok(std::fs::read_to_string(path)?),
        None => Err("No file selected".into()),
    }
}

#[tauri::command]
pub fn save_markdown_file(default_name: String, content: String) -> AppResult<()> {
    let file_path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .save_file();

    match file_path {
        Some(path) => Ok(std::fs::write(path, content)?),
        None => Err("Save cancelled".into()),
    }
}

#[tauri::command]
pub fn pick_multiple_markdown_files() -> AppResult<Vec<MarkdownFile>> {
    let Some(paths) = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .pick_files()
    else {
        return Err("No files selected".into());
    };

    let mut result = Vec::new();
    for path in paths {
        if let Some(filename) = path.file_stem().and_then(|s| s.to_str()) {
            if let Ok(content) = std::fs::read_to_string(&path) {
                result.push(MarkdownFile {
                    title: filename.to_string(),
                    content,
                });
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn save_multiple_markdown_files(files: Vec<MarkdownFile>) -> AppResult<()> {
    let Some(dir) = rfd::FileDialog::new().pick_folder() else {
        return Err("Save cancelled".into());
    };

    for file in files {
        // Sanitize filename to avoid invalid characters
        let sanitized_title: String = file.title
            .chars()
            .map(|c| if c.is_alphanumeric() || c == ' ' || c == '_' || c == '-' { c } else { '_' })
            .collect();

        let mut target_path = dir.join(format!("{}.md", sanitized_title));
        let mut counter = 1;
        while target_path.exists() {
            target_path = dir.join(format!("{}_{}.md", sanitized_title, counter));
            counter += 1;
        }

        std::fs::write(&target_path, file.content)?;
    }
    Ok(())
}
