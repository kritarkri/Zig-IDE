# Zig IDE

An independent, cross-platform desktop IDE for the [Zig programming language](https://ziglang.org/), built with Electron, React, TypeScript and Monaco Editor.

> Zig IDE is an independent community project. It is not affiliated with, sponsored by, or endorsed by the Zig Software Foundation, the Zig language maintainers, or the Zigtools/ZLS project.

## Features

- Monaco editor with Zig syntax highlighting and basic keyword/builtin/snippet completions.
- Run the active file with **F5** (`zig run`).
- Build a standalone executable with **F6** (`zig build-exe`).
- Run tests with **Ctrl+Shift+T** (`zig test`).
- Stop the current compiler/program process.
- Open/save files and folders; create a project.
- New projects ask the installed compiler to run `zig init --minimal`, generating a version-matched `build.zig` and `build.zig.zon`.
- **Tools → Zig Package Manager** runs `zig fetch --save <URL>` for the current project and records the dependency in `build.zig.zon`.
- **Tools → Configure Zig compiler** lets you choose the Zig executable. The setting is stored in the app's user-data folder.
- Open `.zig` files from Explorer/Finder/file managers using the operating system's Open With / Edit with Zig IDE integration.

## First-run setup

On first launch, Zig IDE checks for an existing Zig compiler and ZLS installation. If either tool is missing, the setup wizard offers **Install recommended tools**. It selects the newest stable Zig release for which a matching stable ZLS release is available on the current platform, downloads both from the official Zig download index and Zigtools GitHub releases, and stores them under the application user-data directory. It does not require administrator access and does not modify the system PATH. Existing installations are reused when detected. The setup can be skipped; the IDE remains usable for editing, while compiler and language-server features become available after configuring the tools.

The installer does not bundle compiler binaries, keeping the desktop application download small. Toolchain downloads require an internet connection.

## Requirements

- Node.js 20 or newer for development/building.
- Internet access for the first-run setup wizard if Zig or ZLS is not already installed.
- For Zig package downloads, an internet connection is required.

Zig executable discovery order:
1. Path selected in **Tools → Configure Zig compiler**.
2. `ZIG_EXE` environment variable.
3. `C:\zig\zig.exe` on Windows.
4. `zig` available on `PATH` (macOS/Linux and Windows).

## Development

```sh
npm install
npm run dev
```

Type-check:

```sh
npm run typecheck
```

## Build installers

The CI workflow checks that the official Zig download index and the matching stable ZLS release publish archives for Windows, macOS, and Linux on x64 and arm64 before building the installers.

Build on the target operating system (native builds are the most reliable). The Windows package currently skips optional executable resource editing so an unsigned community build does not require Windows symbolic-link privileges during `winCodeSign` extraction. Windows installers are unsigned unless a code-signing certificate is configured, so Windows SmartScreen may display a reputation warning. The app uses the default Electron icon until a project icon is added:

```sh
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS DMG and ZIP
npm run dist:linux  # Linux AppImage, deb and rpm
```

Artifacts are written to `release/`. macOS builds should be produced on macOS; Windows NSIS builds on Windows; Linux packages on Linux. Use the GitHub Actions workflow to build all three platforms on their respective runners.

## File integration

- **Windows:** the installer adds an `Edit with Zig IDE` entry to the `.zig` file context menu and registers the app as an available handler. It does not force-change the user's default application. Windows may place the entry under **Show more options** on Windows 11.
- **macOS:** the app declares `.zig` as a document type. Finder offers it through **Open With**; macOS does not provide a general Explorer-style custom right-click verb in the same way as Windows.
- **Linux:** packages advertise the Zig MIME type so supported desktop environments can show Zig IDE in **Open With**. AppImage integration depends on the desktop environment/AppImage integration tool.

The app does not need to be copied into a special system folder manually. Use the installer/package for your OS; the OS registers the application. macOS apps conventionally live in `/Applications`, but the DMG installer/copy workflow handles that.

## Zig package manager

Open a project that has `build.zig.zon`, then choose **Tools → Zig Package Manager** and paste an HTTPS archive or Git URL supported by Zig. The IDE runs:

```sh
zig fetch --save <URL>
```

Zig computes the package hash and writes the dependency to `build.zig.zon`. This downloads/records a dependency; it does **not** automatically add a module import to your `build.zig` or source code. Package APIs and module names vary, so connect the dependency according to that package's instructions.

Only install packages from sources you trust. The IDE does not independently audit downloaded Zig source code.

## Credits and acknowledgements

Zig IDE is an independent project built on top of tools and work created by other developers. We are grateful to the people and communities maintaining these projects.

### Zig programming language

A special thank-you to **Andrew Kelley**, the creator of Zig, and to all Zig contributors and maintainers for building and continuously improving the language, compiler, standard library, and documentation. Zig IDE would not exist without their work.

- Official website: https://ziglang.org/
- Official documentation: https://ziglang.org/documentation/
- Official source repository: https://codeberg.org/ziglang/zig
- Zig project contributors: https://codeberg.org/ziglang/zig/activity

Zig and its logos are trademarks or project marks of their respective owners. This project does not claim ownership of Zig and is not an official Zig project.

### Zig Language Server (ZLS)

A separate thank-you to the **Zigtools organization, the ZLS maintainers, and every ZLS contributor** for creating and maintaining the Zig Language Server. Their work makes language-server features such as code completion, diagnostics, hover information, and go-to-definition possible in Zig IDE.

- ZLS project website: https://zigtools.org/zls/
- ZLS source repository: https://github.com/zigtools/zls
- ZLS installation guide: https://zigtools.org/zls/install/
- ZLS releases: https://github.com/zigtools/zls/releases
- Zigtools organization: https://github.com/zigtools

ZLS is a separate open-source project. Zig IDE does not claim authorship of ZLS and is not affiliated with or endorsed by its maintainers.

### Other open-source projects

Thank you to the maintainers and contributors of Electron, React, Monaco Editor, Vite, TypeScript, Tailwind CSS, electron-builder, and Font Awesome. These projects provide the desktop runtime, user interface, editor, build tooling, and icons used by Zig IDE. Their respective project links and license information are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

The Zig IDE source code in this repository is distributed under the MIT License. See [LICENSE](LICENSE). Third-party dependencies and separately installed tools retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Zig Language Server integration

Zig IDE integrates ZLS through the Language Server Protocol. When a saved `.zig` file is opened, the IDE starts ZLS for the current workspace and uses it for context-aware completion, hover information, go-to-definition, and diagnostics in the editor.

Install a ZLS release compatible with your installed Zig release. For Zig `0.17.1`, use a compatible ZLS release from the `0.17.x` line. The setup wizard attempts to select a compatible stable release automatically.

- Installation guide: https://zigtools.org/zls/install/
- Source repository: https://github.com/zigtools/zls
- Releases: https://github.com/zigtools/zls/releases

On Windows, put `zls.exe` on `PATH`, place it at `C:\zig\zls.exe`, set the `ZLS_EXE` environment variable, or choose it from **Tools → Configure ZLS language server...**. Zig and ZLS remain separate executables managed by the IDE. If ZLS is unavailable, normal editing and compiler run/build/test remain available; language intelligence features require ZLS to be installed and running.

## Integrated terminals

The bottom panel supports multiple independent terminal sessions. On Windows it starts PowerShell without the `cmd.exe` startup banner and configures UTF-8 input/output to avoid OEM code-page mojibake. Terminal output is decoded as UTF-8 across stream chunks. Use the plus button in the Terminal panel to create another session.
