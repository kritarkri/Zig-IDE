# Changelog

## 1.4.0

- Added ZLS semantic-token highlighting when the installed language server advertises support for it. The existing local Zig tokenizer remains as a fallback.
- Expanded built-in integer type highlighting to accept arbitrary `uN` and `iN` widths, plus Zig floating-point types including `f80`.
- Advertised full-document semantic-token support in the LSP client capabilities.
- Kept debugging explicitly unsupported; the Debug Console is not presented as a working debugger.


## 1.3.10

- Added Explorer context menus for files, folders, and empty space.
- Added context actions to create files and folders in the selected directory.
- Added confirmed recursive deletion for files and folders.
- Prevented project-root deletion and blocked symbolic-link deletion from the Explorer.
- Fixed folder tree rendering so collapsing a folder hides all nested files and folders.

# Changelog

## 1.3.9

- Queue compiler tasks so Run, Build, and Test wait for an active task instead of failing during process shutdown.
- Normalize generated output/cache folders to the project root before building or starting ZLS.
- Log ZLS process exit code and signal for easier diagnostics.


- Replaced unsupported browser prompt dialogs with native in-app dialogs.
- Fixed editor menu actions to refocus Monaco before running commands.
- Mirrored run/build/test process output into the Terminal tab as well as Output.
- Prevented generated Zig output/cache folders from being used as workspace roots.

# Changelog

## 1.3.4 — Functional menu and project actions
- Rebuilt the menu bar to expose only implemented commands.
- Connected Undo, Redo, Cut, Copy, Paste, Find, Replace, Select All, and Toggle Comment to Monaco Editor.
- Implemented New Folder inside the opened project, including nested folders.
- Added Save As, Exit, Sidebar toggle, Word Wrap, and Minimap actions.
- Added keyboard shortcuts for New File, New Folder, Open File, Save, and Save As.
- Removed inert placeholder controls from the Explorer.
- Fixed the generated Zig starter source string escaping.


## 1.3.2
- Fix Windows packaging configuration: remove unsupported `win.signExecutable` option.
- Keep `win.signAndEditExecutable: false` to avoid unnecessary executable resource editing/signing during unsigned builds.

1.3.1

- Fixed Windows packaging on standard Windows accounts by disabling optional executable resource editing that triggered the winCodeSign symbolic-link extraction failure.
- Added package author metadata.
- Added a live release-asset check for Zig and ZLS across Windows, macOS, and Linux on x64 and arm64.
- Added the toolchain asset check to the cross-platform GitHub Actions build matrix.

## 1.3.0

- Added a first-run setup wizard for Zig and ZLS.
- Detects and reuses existing Zig and ZLS installations.
- Downloads the latest stable Zig release from the official Zig download index when needed.
- Selects a compatible stable ZLS release for the Zig major/minor version.
- Stores managed toolchains in the per-user application data directory without changing system PATH.
- Added automatic publishing of Windows, macOS, and Linux installers to GitHub Releases when a version tag is pushed.

## 1.1.1

- Replaced the one-command output panel with a persistent interactive system shell.
- Added terminal input history, selectable output, Ctrl+A selection, and Ctrl+C interruption when no text is selected.
- Made the Problems, Output, and Debug Console tabs respond to clicks.
- Added basic compiler diagnostic extraction to the Problems panel.
- Removed Cyrillic text from the application source, installer, and project documentation.
- Made build output filenames platform-aware (Windows `.exe`, no extension on macOS/Linux).
- Kept the Debug Console explicit about the missing debugger adapter instead of presenting a non-functional debugger.

## Known limitations

- The Debug Console is a placeholder; source-level debugging requires a debugger adapter (for example, LLDB/DAP) and is not implemented in this release.
- The terminal uses piped shell I/O rather than a full pseudo-terminal. Interactive command-line programs that require terminal control sequences, raw mode, or full-screen TUI behavior may not work correctly.

## 1.2.0

- Integrated ZLS over the Language Server Protocol.
- Added ZLS path discovery and Tools menu configuration.
- Added ZLS-powered completion, hover, go-to-definition, and editor diagnostics.
- Replaced the Windows cmd startup shell with a no-banner UTF-8 PowerShell session.
- Fixed UTF-8 stream decoding so split multibyte characters are not corrupted.
- Added multiple independent integrated terminal sessions.
- Kept editor, terminal input, and terminal output selection scoped to their own controls.

## 1.3.5 - Menu and project workflow fixes

- Removed Electron's native application menu so only the IDE's custom menu bar is shown.
- New File and New Folder now ask the user to open a project when no workspace is active.
- New File now creates the file on disk inside the selected project and adds it to the editor.
- New Folder creates its directory inside the selected project and refreshes the explorer entry.
- Initialize the Zig project before writing the starter source to avoid collisions with `zig init`.
- Use Monaco's editor undo/redo actions and focus the editor before invoking them.
- Allowed the ZLS project link from the Help menu.

## 1.3.8

- Wait for Zig processes to exit before releasing the task lock.
- Resolve build output paths from the project root, not the source file folder.
- Improve text selection and clearing in bottom-panel views.
- Add Zig version discovery, installation, and switching.
- Simplify the toolchain setup dialog.
