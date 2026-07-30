// Native file dialogs (rfd) for markdown import/export, used by the lists module.
// rfd is desktop-only; on mobile these commands return an unsupported error
// so the generate_handler! registration list stays identical across platforms.

use crate::error::AppResult;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct MarkdownFile {
    pub title: String,
    pub content: String,
}

#[cfg(mobile)]
const MOBILE_UNSUPPORTED: &str = "移动端暂不支持文件导入导出";

#[tauri::command]
pub fn pick_markdown_file() -> AppResult<String> {
    #[cfg(desktop)]
    {
        let file_path = rfd::FileDialog::new()
            .add_filter("Markdown", &["md"])
            .pick_file();

        match file_path {
            Some(path) => Ok(std::fs::read_to_string(path)?),
            None => Err("No file selected".into()),
        }
    }
    #[cfg(mobile)]
    {
        Err(MOBILE_UNSUPPORTED.into())
    }
}

#[tauri::command]
pub fn save_markdown_file(default_name: String, content: String) -> AppResult<()> {
    #[cfg(desktop)]
    {
        let file_path = rfd::FileDialog::new()
            .set_file_name(&default_name)
            .add_filter("Markdown", &["md"])
            .save_file();

        match file_path {
            Some(path) => Ok(std::fs::write(path, content)?),
            None => Err("Save cancelled".into()),
        }
    }
    #[cfg(mobile)]
    {
        let _ = (default_name, content);
        Err(MOBILE_UNSUPPORTED.into())
    }
}

#[tauri::command]
pub fn pick_multiple_markdown_files() -> AppResult<Vec<MarkdownFile>> {
    #[cfg(desktop)]
    {
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
    #[cfg(mobile)]
    {
        Err(MOBILE_UNSUPPORTED.into())
    }
}

#[tauri::command]
pub fn save_multiple_markdown_files(files: Vec<MarkdownFile>) -> AppResult<()> {
    #[cfg(desktop)]
    {
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
    #[cfg(mobile)]
    {
        let _ = files;
        Err(MOBILE_UNSUPPORTED.into())
    }
}
