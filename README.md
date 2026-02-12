# Session Folders

Organize sessions into folders with hierarchical structure.

## Features

- Create folders with custom colors
- Hierarchical folder structure (sub-folders supported)
- Collapsible folder tree in sidebar
- Move sessions between folders via context menu
- Home panel with folder-based session filtering
- Right-click folders in home panel to rename or delete
- Expanded/collapsed state persisted across sessions

## Installation

Install from the SimplyTerm plugin registry, or place the plugin folder in your plugins directory.

## Usage

1. **Create folders** from the sidebar "Folders" tab or the home panel "+" button
2. **Move sessions** by right-clicking a session and selecting "Move to folder"
3. **Filter by folder** in the home panel by clicking a folder name
4. **Manage folders** via right-click context menu (rename, delete)

## Permissions

| Permission | Usage |
|------------|-------|
| `ui_sidebar` | Folder tree sidebar tab |
| `ui_context_menu` | "Move to folder" in session context menu |
| `ui_notifications` | User feedback |
| `ui_modals` | Folder creation and deletion dialogs |
| `ui_home_panel` | Home panel folder filter column |
| `fs_read` | Load saved folders |
| `fs_write` | Persist folders and mappings |

## Plugin API

Exposes `window.SimplyTermFoldersAPI` for inter-plugin communication:

- `getFolders()` — Get all folder definitions
- `getSessionFolder(sessionId)` — Get the folder ID for a session
- `moveSessionToFolder(sessionId, folderId)` — Move a session
- `createFolder(name, color?, parentId?)` — Create a new folder
