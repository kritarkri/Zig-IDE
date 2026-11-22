import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn, ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';

let configuredZigPath: string | null = null;
let configuredZlsPath: string | null = null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

async function loadSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    configuredZigPath = typeof settings.zigPath === 'string' ? settings.zigPath : null;
    configuredZlsPath = typeof settings.zlsPath === 'string' ? settings.zlsPath : null;
  } catch { configuredZigPath = null; configuredZlsPath = null; }
}
async function saveSettings() {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify({ zigPath: configuredZigPath, zlsPath: configuredZlsPath }, null, 2), 'utf8');
}


function toolchainDirectory() {
  return path.join(app.getPath('userData'), 'toolchains');
}

async function getZigVersions() {
  const response = await fetch('https://ziglang.org/download/index.json', { headers: { 'User-Agent': 'Zig-IDE' } });
  if (!response.ok) throw new Error(`Could not load Zig versions (${response.status}).`);
  const index = await response.json() as Record<string, any>;
  const key = platformAssetKey();
  const versions = Object.keys(index)
    .filter(version => /^\d+\.\d+\.\d+$/.test(version) && index[version]?.[key]?.tarball && index[version]?.[key]?.shasum)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const installedRoot = path.join(toolchainDirectory(), 'zig-versions');
  let installed: string[] = [];
  try { installed = (await fs.readdir(installedRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); } catch { /* No local versions yet. */ }
  return { versions: [...new Set([...versions, ...installed])].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })), installed, activePath: configuredZigPath };
}

async function installZigVersion(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Zig version.');
  const response = await fetch('https://ziglang.org/download/index.json', { headers: { 'User-Agent': 'Zig-IDE' } });
  if (!response.ok) throw new Error(`Could not load Zig download index (${response.status}).`);
  const index = await response.json() as Record<string, any>;
  const asset = index[version]?.[platformAssetKey()];
  if (!asset?.tarball || !asset?.shasum) throw new Error(`Zig ${version} is not available for this platform.`);
  const root = path.join(toolchainDirectory(), 'zig-versions', version);
  const executableName = process.platform === 'win32' ? 'zig.exe' : 'zig';
  let executable: string | null = null;
  try { executable = await findExecutable(root, [executableName]); } catch { /* Version is not installed yet. */ }
  if (!executable) {
    const extension = process.platform === 'win32' ? '.zip' : '.tar.xz';
    const archive = path.join(toolchainDirectory(), `zig-${version}${extension}`);
    await downloadFile(asset.tarball, archive, asset.shasum);
    await fs.rm(root, { recursive: true, force: true });
    await extractArchive(archive, root);
    executable = await findExecutable(root, [executableName]);
    await fs.rm(archive, { force: true });
    if (!executable) throw new Error(`Zig ${version} was extracted, but the compiler was not found.`);
    if (process.platform !== 'win32') await fs.chmod(executable, 0o755);
  }
  configuredZigPath = executable;
  let zlsVersion: string | null = null;
  try {
    const releaseResponse = await fetch('https://api.github.com/repos/zigtools/zls/releases?per_page=100', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Zig-IDE' }
    });
    if (releaseResponse.ok) {
      const releases = await releaseResponse.json() as Array<any>;
      const [major, minor] = version.split('.');
      const assetName = `zls-${platformAssetKey()}${process.platform === 'win32' ? '.zip' : '.tar.xz'}`;
      const release = releases.filter(item => {
        const match = String(item.tag_name).replace(/^v/, '').match(/^(\d+)\.(\d+)\./);
        return match && match[1] === major && match[2] === minor && !item.prerelease && !item.draft
          && item.assets?.some((asset: any) => asset.name === assetName && asset.browser_download_url);
      }).sort((a, b) => String(b.tag_name).localeCompare(String(a.tag_name), undefined, { numeric: true }))[0];
      const asset = release?.assets?.find((item: any) => item.name === assetName);
      if (release && asset) {
        const zlsRoot = path.join(toolchainDirectory(), 'zls-versions', String(release.tag_name).replace(/[^a-zA-Z0-9._-]/g, '_'));
        let zlsExecutable: string | null = null;
        try { zlsExecutable = await findExecutable(zlsRoot, [process.platform === 'win32' ? 'zls.exe' : 'zls']); } catch { /* Install below. */ }
        if (!zlsExecutable) {
          const extension = process.platform === 'win32' ? '.zip' : '.tar.xz';
          const archive = path.join(toolchainDirectory(), `zls-${release.tag_name}${extension}`);
          const digest = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : undefined;
          await downloadFile(asset.browser_download_url, archive, digest);
          await fs.rm(zlsRoot, { recursive: true, force: true });
          await extractArchive(archive, zlsRoot);
          zlsExecutable = await findExecutable(zlsRoot, [process.platform === 'win32' ? 'zls.exe' : 'zls']);
          await fs.rm(archive, { force: true });
          if (zlsExecutable && process.platform !== 'win32') await fs.chmod(zlsExecutable, 0o755);
        }
        if (zlsExecutable) { configuredZlsPath = zlsExecutable; zlsVersion = String(release.tag_name); }
      }
    }
  } catch { /* Keep the existing ZLS if no compatible release can be installed. */ }
  await saveSettings();
  return { version, path: executable, zlsVersion };
}

function platformAssetKey(): string {
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'ia32' ? 'x86' : process.arch === 'arm' ? 'arm' : 'x86_64';
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform;
  if (os === 'linux' || os === 'windows' || os === 'macos') return `${arch}-${os}`;
  throw new Error(`Automatic toolchain installation is not supported on ${process.platform}/${process.arch}.`);
}

async function downloadFile(url: string, destination: string, expectedSha256?: string) {
  if (!url.startsWith('https://')) throw new Error('Toolchain downloads must use HTTPS.');
  const response = await fetch(url, { headers: { 'User-Agent': 'Zig-IDE-Toolchain-Installer' }, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(destination));
  if (expectedSha256) {
    const actual = createHash('sha256').update(await fs.readFile(destination)).digest('hex');
    if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
      await fs.rm(destination, { force: true });
      throw new Error(`SHA-256 verification failed for ${path.basename(destination)}.`);
    }
  }
}

function runInstallerCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}.`)));
  });
}

async function extractArchive(archive: string, destination: string) {
  await fs.mkdir(destination, { recursive: true });
  if (process.platform === 'win32') {
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
    await runInstallerCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(destination)} -Force`]);
  } else {
    await runInstallerCommand('tar', ['-xf', archive, '-C', destination]);
  }
}

async function findExecutable(root: string, names: string[], depth = 0): Promise<string | null> {
  if (depth > 5) return null;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && names.includes(entry.name.toLowerCase())) return full;
    if (entry.isDirectory()) {
      const found = await findExecutable(full, names, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function installToolchains(onProgress: (message: string) => void) {
  const key = platformAssetKey();
  const root = toolchainDirectory();
  const zigRoot = path.join(root, 'zig');
  const zlsRoot = path.join(root, 'zls');
  let zigExecutable: string | null = null;
  let zigVersion = '';
  let zigIndex: Record<string, any> | null = null;

  try {
    zigExecutable = await resolveZigPath();
    zigVersion = await new Promise<string>((resolve, reject) => {
      const child = spawn(zigExecutable!, ['version'], { windowsHide: true, shell: false }); let output = '';
      child.stdout?.on('data', chunk => output += chunk.toString()); child.once('error', reject);
      child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`zig version exited with ${code}`)));
    });
    configuredZigPath = zigExecutable;
    onProgress(`Using existing Zig ${zigVersion}.`);
  } catch {
    onProgress('Checking the official Zig download index...');
    const indexResponse = await fetch('https://ziglang.org/download/index.json', { headers: { 'User-Agent': 'Zig-IDE-Toolchain-Installer' } });
    if (!indexResponse.ok) throw new Error(`Could not load the official Zig download index (${indexResponse.status}).`);
    zigIndex = await indexResponse.json() as Record<string, any>;
  }

  if (zigVersion && /-dev|nightly/i.test(zigVersion)) {
    throw new Error(`Your existing Zig version (${zigVersion}) is a development build. Automatic ZLS installation requires a matching nightly build; keep your compiler and configure ZLS separately from Tools.`);
  }

  onProgress('Finding a stable ZLS release compatible with Zig...');
  const releasesResponse = await fetch('https://api.github.com/repos/zigtools/zls/releases?per_page=100', {
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Zig-IDE-Toolchain-Installer' }
  });
  if (!releasesResponse.ok) throw new Error(`Could not load ZLS releases (${releasesResponse.status}).${zigExecutable ? ' Your existing Zig installation is still available.' : ''}`);
  const releases = await releasesResponse.json() as Array<any>;
  const zlsAssetName = `zls-${key}${process.platform === 'win32' ? '.zip' : '.tar.xz'}`;
  const findCompatibleRelease = (version: string) => {
    const [major, minor] = version.split('.');
    return releases.filter(release => {
      const match = String(release.tag_name).replace(/^v/, '').match(/^(\d+)\.(\d+)\./);
      return match && match[1] === major && match[2] === minor && !release.prerelease && !release.draft
        && release.assets?.some((asset: any) => asset.name === zlsAssetName && asset.browser_download_url);
    }).sort((a, b) => {
      const aa = String(a.tag_name).replace(/^v/, '').split('.').map(Number);
      const bb = String(b.tag_name).replace(/^v/, '').split('.').map(Number);
      return (bb[0]-aa[0]) || (bb[1]-aa[1]) || (bb[2]-aa[2]);
    })[0];
  };

  if (!zigExecutable) {
    const stableVersions = Object.keys(zigIndex || {}).filter(version => /^\d+\.\d+\.\d+$/.test(version)).sort((a, b) => {
      const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
      return (bb[0]-aa[0]) || (bb[1]-aa[1]) || (bb[2]-aa[2]);
    });
    zigVersion = stableVersions.find(version => zigIndex?.[version]?.[key]?.tarball && zigIndex?.[version]?.[key]?.shasum && findCompatibleRelease(version)) || '';
    if (!zigVersion) throw new Error(`No stable Zig and matching ZLS release are currently available for ${key}. You can install Zig and ZLS manually from their official websites.`);
    const zigAsset = zigIndex![zigVersion][key];
    onProgress(`Downloading Zig ${zigVersion} from ziglang.org...`);
    const extension = process.platform === 'win32' ? '.zip' : '.tar.xz';
    const zigArchive = path.join(root, `zig-${zigVersion}${extension}`);
    await downloadFile(zigAsset.tarball, zigArchive, zigAsset.shasum);
    await fs.rm(zigRoot, { recursive: true, force: true });
    await extractArchive(zigArchive, zigRoot);
    zigExecutable = await findExecutable(zigRoot, process.platform === 'win32' ? ['zig.exe'] : ['zig']);
    if (!zigExecutable) throw new Error('The Zig archive was downloaded, but zig executable was not found.');
    if (process.platform !== 'win32') await fs.chmod(zigExecutable, 0o755);
    configuredZigPath = zigExecutable;
    await fs.rm(zigArchive, { force: true });
    await saveSettings();
  }

  const [major, minor] = zigVersion.split('.');
  const compatible = findCompatibleRelease(zigVersion);
  if (!compatible) throw new Error(`Zig ${zigVersion} is available, but no stable ZLS ${major}.${minor}.x release with a ${key} binary was found. Zig can still be used; configure ZLS later from Tools.`);
  const zlsAsset = compatible.assets.find((asset: any) => asset.name === zlsAssetName);
  onProgress(`Downloading compatible ZLS ${compatible.tag_name}...`);
  const zlsArchive = path.join(root, `zls-${compatible.tag_name}${process.platform === 'win32' ? '.zip' : '.tar.xz'}`);
  const digest = typeof zlsAsset.digest === 'string' && zlsAsset.digest.startsWith('sha256:') ? zlsAsset.digest.slice(7) : undefined;
  await downloadFile(zlsAsset.browser_download_url, zlsArchive, digest);
  await fs.rm(zlsRoot, { recursive: true, force: true });
  await extractArchive(zlsArchive, zlsRoot);
  const zlsExecutable = await findExecutable(zlsRoot, process.platform === 'win32' ? ['zls.exe'] : ['zls']);
  if (!zlsExecutable) throw new Error('The ZLS archive was downloaded, but zls executable was not found.');
  if (process.platform !== 'win32') await fs.chmod(zlsExecutable, 0o755);
  configuredZlsPath = zlsExecutable;
  await saveSettings();
  await fs.rm(zlsArchive, { force: true });
  onProgress(`Toolchain ready: Zig ${zigVersion} and ZLS ${compatible.tag_name}.`);
  return { zigPath: configuredZigPath, zlsPath: configuredZlsPath, zigVersion, zlsVersion: compatible.tag_name };
}

async function getToolchainStatus() {
  let zigPath: string | null = null;
  let zlsPath: string | null = null;
  let zigVersion: string | null = null;
  try { zigPath = await resolveZigPath(); zigVersion = await new Promise<string>((resolve, reject) => {
    const child = spawn(zigPath!, ['version'], { windowsHide: true, shell: false }); let output = '';
    child.stdout?.on('data', chunk => output += chunk.toString()); child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`zig version exited with ${code}`)));
  }); } catch { /* Missing compiler is represented in the setup UI. */ }
  try { zlsPath = await resolveZlsPath(); } catch { /* Missing language server is represented in the setup UI. */ }
  return { zigPath, zlsPath, zigVersion };
}

function zigCandidates() {
  const names = process.platform === 'win32' ? ['zig.exe', 'zig'] : ['zig'];
  const candidates = [
    configuredZigPath,
    process.env.ZIG_EXE,
    process.platform === 'win32' ? 'C:\\zig\\zig.exe' : null,
    ...names
  ].filter((x): x is string => !!x);
  return candidates;
}
async function resolveZigPath(): Promise<string> {
  for (const candidate of zigCandidates()) {
    try {
      if (path.isAbsolute(candidate)) await fs.access(candidate);
      else if (candidate.includes(path.sep)) await fs.access(candidate);
      else {
        const check = spawn(candidate, ['version'], { windowsHide: true, shell: false });
        const ok = await new Promise<boolean>(resolve => { check.once('error', () => resolve(false)); check.once('close', code => resolve(code === 0)); });
        if (ok) return candidate;
        continue;
      }
      return candidate;
    } catch { /* try next candidate */ }
  }
  throw new Error('Zig compiler not found. Use Tools → Configure Zig or set the ZIG_EXE environment variable.');
}
let mainWindow: BrowserWindow | null = null;
let activeProcess: ChildProcess | null = null;
let processQueue: Promise<void> = Promise.resolve();
const terminalProcesses = new Map<string, ChildProcess>();
let queuedOpenPath: string | null = null;

function sendOutput(text: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const line of text.replace(/\r/g, '').split('\n')) mainWindow.webContents.send('process:output', line);
}
function startProcess(command: string, args: string[], cwd: string) {
  // Serialize compiler tasks. A process can emit `exit` slightly before `close`;
  // queueing avoids rejecting a valid Run request during that short interval.
  const task = processQueue.then(() => executeProcess(command, args, cwd));
  processQueue = task.then(() => undefined, () => undefined);
  return task;
}

function executeProcess(command: string, args: string[], cwd: string) {
  activeProcess = null;
  return new Promise<{ started: boolean }>((resolve, reject) => {
    sendOutput(`> ${path.basename(command)} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd, windowsHide: true, shell: false,
      detached: process.platform !== 'win32',
      env: { ...process.env, PATH: `${path.dirname(command)}${path.delimiter}${process.env.PATH || ''}` }
    });
    activeProcess = child;
    let spawnSettled = false;
    let closed = false;
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdoutPending = '';
    let stderrPending = '';
    const forwardText = (text: string, stream: 'stdout' | 'stderr') => {
      const pending = stream === 'stdout' ? stdoutPending + text : stderrPending + text;
      const lines = pending.split(/\r?\n/);
      const remainder = lines.pop() || '';
      if (stream === 'stdout') stdoutPending = remainder; else stderrPending = remainder;
      lines.forEach(line => sendOutput(line));
    };
    child.stdout?.on('data', (data: Buffer) => forwardText(stdoutDecoder.write(data), 'stdout'));
    child.stderr?.on('data', (data: Buffer) => forwardText(stderrDecoder.write(data), 'stderr'));
    child.once('error', error => {
      sendOutput(`Process launch error: ${error.message}`);
      if (activeProcess === child) activeProcess = null;
      if (!spawnSettled) { spawnSettled = true; reject(error); }
    });
    child.once('spawn', () => { spawnSettled = true; });
    child.once('exit', () => {
      // The process has exited; the close event below drains its output streams.
      if (activeProcess === child && child.exitCode !== null) activeProcess = null;
    });
    child.once('close', (code, signal) => {
      if (closed) return;
      closed = true;
      if (activeProcess === child) activeProcess = null;
      forwardText(stdoutDecoder.end(), 'stdout');
      forwardText(stderrDecoder.end(), 'stderr');
      if (stdoutPending) { sendOutput(stdoutPending); stdoutPending = ''; }
      if (stderrPending) { sendOutput(stderrPending); stderrPending = ''; }
      sendOutput(code === 0 ? 'Process completed successfully.' : `Process exited with code ${code ?? 'unknown'} (signal: ${signal ?? 'none'}).`);
      mainWindow?.webContents.send('process:exit', { code, signal });
      if (spawnSettled) resolve({ started: true });
    });
  });
}

async function findProjectRoot(startDirectory: string): Promise<string> {
  let current = path.resolve(startDirectory);
  for (let depth = 0; depth < 10; depth++) {
    const base = path.basename(current).toLowerCase();
    if (['zig-out', 'zig-cache', '.zig-cache'].includes(base)) {
      return path.dirname(current);
    }
    const markers = ['build.zig', 'build.zig.zon', '.git'];
    for (const marker of markers) {
      try { await fs.access(path.join(current, marker)); return current; } catch { /* Check parent. */ }
    }
    try {
      if (await fs.stat(path.join(current, 'src', 'main.zig')).then(stat => stat.isFile())) return current;
    } catch { /* Check parent. */ }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDirectory);
}

async function normalizeProjectRoot(rootPath: string): Promise<string> {
  let root = path.resolve(rootPath);
  if (['zig-out', 'zig-cache', '.zig-cache'].includes(path.basename(root).toLowerCase())) {
    root = path.dirname(root);
  }
  return findProjectRoot(root);
}

async function listProjectFiles(root: string, relative = ''): Promise<Array<{ path: string; diskPath: string; name: string; content: string }>> {
  const dir = path.join(root, relative);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: Array<{ path: string; diskPath: string; name: string; content: string }> = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'zig-cache' || entry.name === 'zig-out' || entry.name === '.zig-cache') continue;
    const rel = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    const full = path.join(root, relative, entry.name);
    if (entry.isDirectory()) result.push(...await listProjectFiles(root, path.join(relative, entry.name)));
    else if (/\.(zig|zon|md|txt|json|toml|ya?ml)$/i.test(entry.name) || entry.name === '.gitignore') {
      const stat = await fs.stat(full);
      if (stat.size <= 2_000_000) result.push({ path: rel, diskPath: full, name: entry.name, content: await fs.readFile(full, 'utf8') });
    }
  }
  return result;
}

type PendingLspRequest = { resolve: (value: any) => void; reject: (error: Error) => void };
let zlsProcess: ChildProcess | null = null;
let zlsRoot: string | null = null;
let zlsSemanticTokensLegend: { tokenTypes: string[]; tokenModifiers: string[] } | null = null;
let zlsZigExecutable: string | null = null;
let lspBuffer = Buffer.alloc(0);
let lspRequestId = 1;
const pendingLsp = new Map<number, PendingLspRequest>();

async function resolveZlsPath(): Promise<string> {
  const candidates = [configuredZlsPath, process.env.ZLS_EXE,
    process.platform === 'win32' ? 'C:\\zig\\zls.exe' : null,
    process.platform === 'win32' ? 'zls.exe' : 'zls'].filter((x): x is string => !!x);
  for (const candidate of candidates) {
    try {
      if (path.isAbsolute(candidate) || candidate.includes(path.sep)) await fs.access(candidate);
      else {
        const probe = spawn(candidate, ['--version'], { windowsHide: true, shell: false });
        const ok = await new Promise<boolean>(resolve => { probe.once('error', () => resolve(false)); probe.once('close', code => resolve(code === 0)); });
        if (!ok) continue;
      }
      return candidate;
    } catch { /* Try the next candidate. */ }
  }
  throw new Error('ZLS was not found. Install a ZLS build compatible with your Zig version, add it to PATH, or set ZLS_EXE.');
}

function writeLsp(message: Record<string, unknown>) {
  if (!zlsProcess?.stdin?.writable) throw new Error('ZLS is not running.');
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  zlsProcess.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
}

function handleLspData(chunk: Buffer) {
  lspBuffer = Buffer.concat([lspBuffer, chunk]);
  while (true) {
    const split = lspBuffer.indexOf('\r\n\r\n');
    if (split < 0) return;
    const header = lspBuffer.subarray(0, split).toString('ascii');
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (!lengthMatch) { lspBuffer = lspBuffer.subarray(split + 4); continue; }
    const length = Number(lengthMatch[1]);
    const bodyStart = split + 4;
    if (lspBuffer.length < bodyStart + length) return;
    const body = lspBuffer.subarray(bodyStart, bodyStart + length).toString('utf8');
    lspBuffer = lspBuffer.subarray(bodyStart + length);
    let message: any;
    try { message = JSON.parse(body); } catch { continue; }
    if (message.method && message.id !== undefined) {
      let result: unknown = null;
      if (message.method === 'workspace/workspaceFolders') result = zlsRoot ? [{ uri: pathToFileURL(zlsRoot + path.sep).toString(), name: path.basename(zlsRoot) }] : [];
      else if (message.method === 'workspace/configuration') result = (message.params?.items || []).map(() => zlsZigExecutable ? { zig_exe_path: zlsZigExecutable } : null);
      else if (message.method === 'workspace/applyEdit') result = { applied: false };
      writeLsp({ jsonrpc: '2.0', id: message.id, result });
    } else if (typeof message.id === 'number' && pendingLsp.has(message.id)) {
      const pending = pendingLsp.get(message.id)!; pendingLsp.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'ZLS request failed'));
      else pending.resolve(message.result);
    } else if (message.method === 'textDocument/publishDiagnostics') {
      mainWindow?.webContents.send('lsp:diagnostics', message.params);
    } else if (message.method === 'window/logMessage' || message.method === 'window/showMessage') {
      mainWindow?.webContents.send('lsp:message', message.params);
    }
  }
}

function lspRequest(method: string, params: unknown): Promise<any> {
  const id = lspRequestId++;
  return new Promise((resolve, reject) => {
    pendingLsp.set(id, { resolve, reject });
    try { writeLsp({ jsonrpc: '2.0', id, method, params }); }
    catch (error) { pendingLsp.delete(id); reject(error as Error); }
    const timer = setTimeout(() => { if (pendingLsp.has(id)) { pendingLsp.delete(id); reject(new Error(`ZLS request timed out: ${method}`)); } }, 15000);
    const originalResolve = pendingLsp.get(id)!.resolve;
    const originalReject = pendingLsp.get(id)!.reject;
    pendingLsp.set(id, { resolve: value => { clearTimeout(timer); originalResolve(value); }, reject: error => { clearTimeout(timer); originalReject(error); } });
  });
}

async function startZls(rootPath: string) {
  const root = await normalizeProjectRoot(rootPath || app.getPath('documents'));
  if (zlsProcess && !zlsProcess.killed && zlsRoot === root) return { started: true, path: await resolveZlsPath() };
  if (zlsProcess) { try { zlsProcess.kill(); } catch { /* ignore */ } zlsProcess = null; }
  const executable = await resolveZlsPath();
  const zigExecutable = await resolveZigPath();
  zlsZigExecutable = zigExecutable;
  const child = spawn(executable, [], { cwd: root, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PATH: `${path.dirname(zigExecutable)}${path.delimiter}${process.env.PATH || ''}` } });
  zlsProcess = child; zlsRoot = root; lspBuffer = Buffer.alloc(0);
  child.stdout?.on('data', handleLspData);
  const stderrDecoder = new StringDecoder('utf8');
  child.stderr?.on('data', (chunk: Buffer) => {
    const value = stderrDecoder.write(chunk).trim();
    if (value) mainWindow?.webContents.send('lsp:message', { type: 2, message: value });
  });
  child.on('error', error => { mainWindow?.webContents.send('lsp:message', { type: 1, message: `ZLS process error: ${error.message}` }); zlsProcess = null; });
  child.on('close', (code, signal) => { if (zlsProcess === child) zlsProcess = null; const detail = `ZLS process closed (code: ${code ?? 'unknown'}, signal: ${signal ?? 'none'}).`; mainWindow?.webContents.send('lsp:message', { type: 2, message: detail }); for (const item of pendingLsp.values()) item.reject(new Error(`ZLS exited (${code ?? 'unknown'}).`)); pendingLsp.clear(); mainWindow?.webContents.send('lsp:status', { running: false }); });
  await new Promise<void>((resolve, reject) => { child.once('spawn', () => resolve()); child.once('error', reject); });
  const initializeResult = await lspRequest('initialize', { processId: process.pid, clientInfo: { name: 'Zig IDE', version: app.getVersion() }, initializationOptions: { zig_exe_path: zigExecutable }, rootUri: pathToFileURL(root + path.sep).toString(), workspaceFolders: [{ uri: pathToFileURL(root + path.sep).toString(), name: path.basename(root) }], capabilities: { textDocument: { synchronization: { didSave: true }, completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] } }, hover: { contentFormat: ['markdown', 'plaintext'] }, definition: {}, publishDiagnostics: { relatedInformation: true }, semanticTokens: { dynamicRegistration: false, requests: { range: false, full: true }, tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'], tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'], formats: ['relative'], multilineTokenSupport: false, overlappingTokenSupport: false } } } } });
  const semanticProvider = initializeResult?.capabilities?.semanticTokensProvider;
  zlsSemanticTokensLegend = semanticProvider?.legend?.tokenTypes && semanticProvider?.legend?.tokenModifiers
    ? { tokenTypes: semanticProvider.legend.tokenTypes, tokenModifiers: semanticProvider.legend.tokenModifiers }
    : null;
  writeLsp({ jsonrpc: '2.0', method: 'initialized', params: {} });
  mainWindow?.webContents.send('lsp:status', { running: true, path: executable, root });
  return { started: true, path: executable };
}

function createWindow() {
  // The IDE provides its own in-app menus; never show Electron's native menu bar.
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 950, minHeight: 650, backgroundColor: '#1a1a2e', title: 'Zig IDE', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.setMenuBarVisibility(false);
  if (!app.isPackaged) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function acceptZigArgument(argv: string[]) {
  const candidate = argv.find((arg, index) => index > 0 && arg.toLowerCase().endsWith('.zig'));
  if (candidate) queuedOpenPath = path.resolve(candidate);
}
if (app.isPackaged) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) app.quit();
  else app.on('second-instance', (_event, argv) => {
    acceptZigArgument(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (queuedOpenPath) { mainWindow.webContents.send('file:open-path', queuedOpenPath); queuedOpenPath = null; }
    }
  });
}
acceptZigArgument(process.argv);
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.toLowerCase().endsWith('.zig')) {
    queuedOpenPath = filePath;
    if (mainWindow) mainWindow.webContents.send('file:open-path', filePath);
  }
});

app.whenReady().then(async () => {
  await loadSettings();
  ipcMain.handle('toolchain:status', async () => getToolchainStatus());
  ipcMain.handle('zig:versions', async () => getZigVersions());
  ipcMain.handle('zig:install-version', async (_event, version: string) => installZigVersion(version));
  ipcMain.handle('toolchain:install', async () => installToolchains(message => mainWindow?.webContents.send('toolchain:progress', message)));
  ipcMain.handle('zig:choose-path', async () => {
    const filters = process.platform === 'win32'
      ? [{ name: 'Zig compiler', extensions: ['exe'] }]
      : [{ name: 'Zig executable', extensions: ['*'] }];
    const pick = await dialog.showOpenDialog({ title: 'Select Zig compiler', properties: ['openFile'], filters });
    if (pick.canceled || !pick.filePaths[0]) return null;
    configuredZigPath = pick.filePaths[0];
    await saveSettings();
    const zig = await resolveZigPath();
    return { path: zig };
  });
  ipcMain.handle('zig:get-path', async () => resolveZigPath());
  ipcMain.handle('zig:fetch-package', async (_event, args: { projectRoot: string; url: string }) => {
    if (!args?.projectRoot || !args?.url) throw new Error('Select a project and provide a package URL.');
    if (!/^https:\/\//i.test(args.url) && !/^git\+https:\/\//i.test(args.url)) throw new Error('Only HTTPS and git+https URLs are allowed.');
    const manifest = path.join(args.projectRoot, 'build.zig.zon');
    try { await fs.access(manifest); } catch { throw new Error('This project has no build.zig.zon manifest. Create a Zig package manifest before adding dependencies.'); }
    return startProcess(await resolveZigPath(), ['fetch', '--save', args.url], args.projectRoot);
  });
  ipcMain.handle('zls:choose-path', async () => {
    const filters = process.platform === 'win32' ? [{ name: 'ZLS executable', extensions: ['exe'] }] : [{ name: 'ZLS executable', extensions: ['*'] }];
    const pick = await dialog.showOpenDialog({ title: 'Select ZLS executable', properties: ['openFile'], filters });
    if (pick.canceled || !pick.filePaths[0]) return null;
    configuredZlsPath = pick.filePaths[0];
    await saveSettings();
    return { path: await resolveZlsPath() };
  });
  ipcMain.handle('zls:get-path', async () => resolveZlsPath());
  ipcMain.handle('zls:start', async (_event, rootPath: string) => startZls(rootPath));
  ipcMain.handle('zls:semantic-legend', async () => zlsSemanticTokensLegend);
  ipcMain.handle('zls:request', async (_event, request: { method: string; params: unknown }) => {
    if (!zlsProcess || zlsProcess.killed) throw new Error('ZLS is not running.');
    return lspRequest(request.method, request.params);
  });
  ipcMain.handle('zls:notify', async (_event, notification: { method: string; params: unknown }) => {
    if (!zlsProcess || zlsProcess.killed) return false;
    writeLsp({ jsonrpc: '2.0', method: notification.method, params: notification.params });
    return true;
  });
  ipcMain.handle('zls:open-document', async (_event, doc: { filePath: string; text: string; languageId?: string }) => {
    if (!zlsProcess || zlsProcess.killed) throw new Error('ZLS is not running.');
    writeLsp({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: pathToFileURL(doc.filePath).toString(), languageId: doc.languageId || 'zig', version: 1, text: doc.text } } });
    return true;
  });
  ipcMain.handle('zls:change-document', async (_event, doc: { filePath: string; text: string; version: number }) => {
    if (!zlsProcess || zlsProcess.killed) return false;
    writeLsp({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri: pathToFileURL(doc.filePath).toString(), version: doc.version }, contentChanges: [{ text: doc.text }] } });
    return true;
  });
  ipcMain.handle('zls:report-error', async (_event, message: string) => { mainWindow?.webContents.send('lsp:message', { type: 1, message }); return true; });
  ipcMain.handle('zls:stop', async () => { if (!zlsProcess) return false; zlsProcess.kill(); zlsProcess = null; zlsRoot = null; zlsSemanticTokensLegend = null; return true; });
  ipcMain.handle('file:get-pending-path', async () => { const value = queuedOpenPath; queuedOpenPath = null; return value; });
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    const allowed = ['https://ziglang.org/', 'https://codeberg.org/ziglang/zig', 'https://ziglang.org/documentation/', 'https://github.com/zigtools/zls'];
    if (!allowed.includes(url)) throw new Error('URL is not allowed.');
    await shell.openExternal(url);
  });
  ipcMain.handle('zig:version', async () => {
    const zig = await resolveZigPath();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(zig, ['version'], { windowsHide: true, shell: false });
      let output = '';
      child.stdout.on('data', d => output += d.toString());
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`zig version exited with code ${code}`)));
    });
  });
  ipcMain.handle('file:open', async () => {
    const pick = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Zig and text files', extensions: ['zig', 'zon', 'txt', 'md', 'json', 'toml'] }, { name: 'All files', extensions: ['*'] }] });
    if (pick.canceled || !pick.filePaths[0]) return null;
    const filePath = pick.filePaths[0];
    return { diskPath: filePath, path: path.basename(filePath), name: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
  });
  ipcMain.handle('file:open-path', async (_event, filePath: string) => {
    if (!filePath || !filePath.toLowerCase().endsWith('.zig')) throw new Error('Only .zig files can be opened with this action.');
    return { diskPath: filePath, path: path.basename(filePath), name: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
  });
  ipcMain.handle('project:create', async (_event, projectName: string) => {
    const pick = await dialog.showOpenDialog({ title: 'Choose a location for the new Zig project', properties: ['openDirectory', 'createDirectory'] });
    if (pick.canceled || !pick.filePaths[0]) return null;
    const safeName = (projectName || 'my-zig-project').trim().replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '') || 'my-zig-project';
    let root = path.join(pick.filePaths[0], safeName);
    let suffix = 2;
    while (true) { try { await fs.access(root); root = path.join(pick.filePaths[0], `${safeName}-${suffix++}`); } catch { break; } }
    await fs.mkdir(root, { recursive: true });
    // Initialize first so Zig can create its build files without colliding with our starter source.
    try {
      const zig = await resolveZigPath();
      await new Promise<void>((resolve, reject) => {
        const init = spawn(zig, ['init', '--minimal'], { cwd: root, windowsHide: true, shell: false });
        let errorText = '';
        init.stderr?.on('data', chunk => errorText += chunk.toString());
        init.on('error', reject);
        init.on('close', code => code === 0 ? resolve() : reject(new Error(errorText || `zig init exited with ${code}`)));
      });
    } catch (error) {
      // Project creation remains available even when the compiler is not configured.
      console.warn('zig init was skipped:', error);
    }
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    const mainSource = 'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello from Zig!\\n", .{});\n}\n';
    await fs.writeFile(path.join(root, 'src', 'main.zig'), mainSource, 'utf8');
    await fs.writeFile(path.join(root, 'README.md'), `# ${safeName}\n\nA Zig project created with Zig IDE.\n\n## Run\n\nPress F5 in Zig IDE or run \`zig run src/main.zig\`.\n\n## Build\n\nPress F6 in Zig IDE or run \`zig build-exe src/main.zig\`.\n`, 'utf8');
    await fs.writeFile(path.join(root, '.gitignore'), 'zig-cache/\n.zig-cache/\nzig-out/\n', 'utf8');
    return { root, files: await listProjectFiles(root) };
  });
  ipcMain.handle('project:create-file', async (_event, args: { root: string; relativePath: string; content: string }) => {
    if (!args?.root || !args?.relativePath) throw new Error('Project folder and file name are required.');
    const cleanParts = args.relativePath.split(/[\\/]+/).filter(Boolean);
    if (!cleanParts.length || cleanParts.some(part => part === '.' || part === '..' || /[<>:"|?*]/.test(part))) throw new Error('Invalid file path.');
    const target = path.resolve(args.root, ...cleanParts);
    const relative = path.relative(path.resolve(args.root), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File must stay inside the project.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.content ?? '', { encoding: 'utf8', flag: 'wx' });
    return { path: relative.split(path.sep).join('/'), diskPath: target, name: path.basename(target), content: args.content ?? '' };
  });
  ipcMain.handle('project:delete-path', async (_event, args: { root: string; relativePath: string }) => {
    if (!args?.root || !args?.relativePath) throw new Error('Project folder and path are required.');
    const root = await fs.realpath(path.resolve(args.root));
    const cleanParts = args.relativePath.split(/[\\/]+/).filter(Boolean);
    if (!cleanParts.length || cleanParts.some(part => part === '.' || part === '..')) throw new Error('Invalid project path.');
    const target = path.resolve(root, ...cleanParts);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The project root cannot be deleted.');
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error('Symbolic links cannot be deleted from the project explorer.');
    const realTarget = await fs.realpath(target);
    const realRelative = path.relative(root, realTarget);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('The selected path is outside the project.');
    await fs.rm(target, { recursive: stat.isDirectory(), force: false });
    return { deleted: true };
  });
  ipcMain.handle('project:create-folder', async (_event, args: { root: string; relativePath: string }) => {
    if (!args?.root || !args?.relativePath) throw new Error('Project folder and folder name are required.');
    const cleanParts = args.relativePath.split(/[\\/]+/).filter(Boolean);
    if (!cleanParts.length || cleanParts.some(part => part === '.' || part === '..' || /[<>:"|?*]/.test(part))) throw new Error('Invalid folder name.');
    const target = path.resolve(args.root, ...cleanParts);
    const relative = path.relative(path.resolve(args.root), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Folder must stay inside the project.');
    await fs.mkdir(target, { recursive: true });
    const keepPath = path.join(target, '.gitkeep');
    try { await fs.writeFile(keepPath, '', { flag: 'wx' }); } catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    return { path: path.relative(args.root, target).replace(/\\/g, '/'), diskPath: target };
  });
  ipcMain.handle('app:exit', () => { app.quit(); });
  ipcMain.handle('project:open', async () => {
    const pick = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (pick.canceled || !pick.filePaths[0]) return null;
    const root = await normalizeProjectRoot(pick.filePaths[0]);
    return { root, files: await listProjectFiles(root) };
  });
  ipcMain.handle('file:save', async (_event, args: { filePath?: string; content: string }) => {
    let filePath = args.filePath;
    if (!filePath) {
      const pick = await dialog.showSaveDialog({ defaultPath: 'main.zig', filters: [{ name: 'Zig source', extensions: ['zig'] }, { name: 'All files', extensions: ['*'] }] });
      if (pick.canceled || !pick.filePath) return null;
      filePath = pick.filePath;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, args.content, 'utf8');
    return { diskPath: filePath, name: path.basename(filePath), path: filePath };
  });
  ipcMain.handle('zig:run', async (_event, filePath: string) => {
    if (!filePath) throw new Error('Save the file first.');
    return startProcess(await resolveZigPath(), ['run', filePath], path.dirname(filePath));
  });
  ipcMain.handle('zig:test', async (_event, filePath: string) => {
    if (!filePath) throw new Error('Save the file first.');
    return startProcess(await resolveZigPath(), ['test', filePath], path.dirname(filePath));
  });
  ipcMain.handle('zig:build', async (_event, args: { filePath: string; outputRoot?: string }) => {
    const filePath = args.filePath;
    if (!filePath) throw new Error('Save the file first.');
    const projectRoot = await normalizeProjectRoot(args.outputRoot || path.dirname(filePath));
    const outDir = path.join(projectRoot, 'zig-out', 'bin');
    await fs.mkdir(outDir, { recursive: true });
    const executableExtension = process.platform === 'win32' ? '.exe' : '';
    const outputPath = path.join(outDir, `${path.basename(filePath, path.extname(filePath))}${executableExtension}`);
    return startProcess(await resolveZigPath(), ['build-exe', filePath, '-O', 'ReleaseFast', `-femit-bin=${outputPath}`], path.dirname(filePath));
  });
  ipcMain.handle('process:stop', async () => {
    if (!activeProcess) return false;
    const pid = activeProcess.pid;
    if (process.platform === 'win32' && pid) {
      spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, shell: false });
    } else if (pid) {
      try { process.kill(-pid, 'SIGTERM'); } catch { activeProcess.kill('SIGTERM'); }
    } else activeProcess.kill();
    return true;
  });
  ipcMain.handle('terminal:start', async (_event, args?: { id?: string; cwd?: string }) => {
    const id = args?.id || 'terminal-1';
    const existing = terminalProcesses.get(id);
    if (existing && !existing.killed) return { started: true, id };
    const workingDirectory = args?.cwd || app.getPath('documents');
    // PowerShell avoids cmd.exe's OEM-code-page banner and starts without profile noise.
    const command = process.platform === 'win32' ? 'powershell.exe' : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    const argsList = process.platform === 'win32'
      ? ['-NoLogo', '-NoProfile', '-NoExit', '-Command', "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()"]
      : ['--noprofile', '--norc', '-i'];
    const child = spawn(command, argsList, { cwd: workingDirectory, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } });
    terminalProcesses.set(id, child);
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const forward = (data: string) => { if (data && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal:data', { id, data }); };
    child.stdout?.on('data', (data: Buffer) => forward(stdoutDecoder.write(data)));
    child.stderr?.on('data', (data: Buffer) => forward(stderrDecoder.write(data)));
    child.on('error', error => { forward(`\r\nTerminal error: ${error.message}\r\n`); terminalProcesses.delete(id); });
    child.on('close', code => { forward(`\r\n[Shell exited: ${code ?? 'unknown'}]\r\n`); terminalProcesses.delete(id); });
    return new Promise((resolve, reject) => { child.once('spawn', () => resolve({ started: true, id })); child.once('error', reject); });
  });
  ipcMain.handle('terminal:write', async (_event, args: { id?: string; input: string }) => {
    const child = terminalProcesses.get(args?.id || 'terminal-1');
    if (!child || child.killed || !child.stdin?.writable) throw new Error('Terminal shell is not running.');
    child.stdin.write(args.input);
    return true;
  });
  ipcMain.handle('terminal:stop', async (_event, id?: string) => {
    const key = id || 'terminal-1';
    const child = terminalProcesses.get(key);
    if (!child) return false;
    terminalProcesses.delete(key);
    if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false });
    else child.kill('SIGTERM');
    return true;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (activeProcess) activeProcess.kill();
  for (const terminal of terminalProcesses.values()) terminal.kill();
  if (zlsProcess) zlsProcess.kill(); });
