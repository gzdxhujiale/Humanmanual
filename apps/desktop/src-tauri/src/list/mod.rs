// Lists module, organized as a directory:
//   types.rs     - DTOs shared by commands and the frontend
//   commands.rs  - load + CRUD tauri commands
//   migration.rs - one-shot migration from localStorage
//
// Commands are registered in lib.rs via their full paths
// (`list::commands::*`, `list::migration::*`).

pub mod types;
pub mod commands;
pub mod migration;
