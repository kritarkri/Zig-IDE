# Third-party notices

Zig IDE uses or can download the open-source projects listed below. The names, source code, trademarks, and licenses of those projects remain with their respective owners. This document is an acknowledgement and a project-level license summary; it does not replace the license files or notices distributed by upstream projects.

## Language toolchain

### Zig

**Purpose:** Zig compiler and standard library. Zig is installed separately or downloaded by the first-run setup wizard.

**Acknowledgement:** Special thanks to **Andrew Kelley**, creator of the Zig programming language, and to all Zig maintainers and contributors for their work on the language, compiler, standard library, and documentation.

- Official website: https://ziglang.org/
- Documentation: https://ziglang.org/documentation/
- Source repository: https://codeberg.org/ziglang/zig
- License: See the license included with the official Zig distribution and the upstream repository.

### Zig Language Server (ZLS)

**Purpose:** Language-server features used by the IDE, including completion, diagnostics, hover information, and go-to-definition. ZLS is a separate executable and may be downloaded by the first-run setup wizard.

**Acknowledgement:** Special thanks to the **Zigtools organization, the ZLS maintainers, and all ZLS contributors** for creating and maintaining this language server and making it available to the Zig community.

- Project website: https://zigtools.org/zls/
- Source repository: https://github.com/zigtools/zls
- Installation guide: https://zigtools.org/zls/install/
- Releases: https://github.com/zigtools/zls/releases
- License: See the license file in the upstream ZLS repository and the license applicable to the downloaded release.

## Application dependencies

| Component | Purpose | License / source |
|---|---|---|
| Electron | Desktop runtime | MIT — https://github.com/electron/electron |
| React / React DOM | UI framework | MIT — https://github.com/facebook/react |
| Monaco Editor | Code editor | MIT — https://github.com/microsoft/monaco-editor |
| @monaco-editor/react | React integration | MIT — https://github.com/suren-atoyan/monaco-react |
| Vite | Frontend build tool | MIT — https://github.com/vitejs/vite |
| TypeScript | Type checking and compilation | Apache-2.0 — https://github.com/microsoft/TypeScript |
| Tailwind CSS | Styling | MIT — https://github.com/tailwindlabs/tailwindcss |
| electron-builder | Application packaging | MIT — https://github.com/electron-userland/electron-builder |
| Font Awesome Free | Icons | CC BY 4.0 / SIL OFL 1.1 / MIT depending on asset — https://fontawesome.com/license/free |

## General acknowledgement

Thank you to every maintainer and contributor whose work is used by Zig IDE, directly or through its dependencies. We encourage users to visit the upstream projects, read their documentation, and support their maintainers.

Check the license files and notices distributed with each exact dependency version before redistributing binaries. License identifiers and links above are a high-level summary, not legal advice or a substitute for upstream license texts.
