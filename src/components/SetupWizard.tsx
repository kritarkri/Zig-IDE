import { useEffect, useState } from 'react';

type ToolchainStatus = { zigPath: string | null; zlsPath: string | null; zigVersion: string | null };
type VersionList = { versions: string[]; installed: string[]; activePath: string | null };
type Props = { onClose: () => void; onInstalled: () => void };

export default function SetupWizard({ onClose, onInstalled }: Props) {
  const [status, setStatus] = useState<ToolchainStatus | null>(null);
  const [versions, setVersions] = useState<VersionList | null>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    const [current, available] = await Promise.all([
      window.zigIDE.getToolchainStatus(),
      window.zigIDE.getZigVersions()
    ]);
    setStatus(current);
    setVersions(available);
    setSelectedVersion(available.versions.includes(current.zigVersion || '') ? (current.zigVersion || '') : (available.versions[0] || ''));
  };

  useEffect(() => {
    let alive = true;
    void Promise.all([window.zigIDE.getToolchainStatus(), window.zigIDE.getZigVersions()])
      .then(([current, available]) => {
        if (!alive) return;
        setStatus(current);
        setVersions(available);
        setSelectedVersion(available.versions.includes(current.zigVersion || '') ? (current.zigVersion || '') : (available.versions[0] || ''));
      })
      .catch(reason => { if (alive) setError(String(reason)); });
    const unsubscribe = window.zigIDE.onToolchainProgress(message => setProgress(message));
    return () => { alive = false; unsubscribe(); };
  }, []);

  const installRecommended = async () => {
    setBusy(true); setError('');
    try {
      await window.zigIDE.installToolchains();
      await refresh();
      onInstalled();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await window.zigIDE.getToolchainStatus().then(setStatus).catch(() => undefined);
    } finally { setBusy(false); setProgress(''); }
  };

  const installVersion = async () => {
    if (!selectedVersion) return;
    setBusy(true); setError('');
    try {
      setProgress(`Installing Zig ${selectedVersion}...`);
      await window.zigIDE.installZigVersion(selectedVersion);
      await refresh();
      onInstalled();
      setProgress('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const ready = Boolean(status?.zigPath && status?.zlsPath);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#17172b] p-5 shadow-2xl">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Toolchains</h2>
            <p className="mt-1 text-xs text-gray-500">Zig compiler and language server</p>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-gray-500 hover:bg-white/5 hover:text-gray-200" aria-label="Close">×</button>
        </header>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
            <span className="text-gray-300">Zig {status?.zigVersion || '—'}</span>
            <span className={status?.zigPath ? 'text-emerald-400' : 'text-gray-500'}>{status?.zigPath ? 'Ready' : 'Missing'}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
            <span className="text-gray-300">ZLS</span>
            <span className={status?.zlsPath ? 'text-emerald-400' : 'text-gray-500'}>{status?.zlsPath ? 'Ready' : 'Missing'}</span>
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <label className="mb-2 block text-xs text-gray-400" htmlFor="zig-version">Zig version</label>
          <div className="flex gap-2">
            <select id="zig-version" value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)} disabled={busy || !versions?.versions.length} className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#10101d] px-3 py-2 text-sm text-gray-200 outline-none focus:border-violet-500">
              {(versions?.versions || []).map(version => <option key={version} value={version}>{version}{versions?.installed.includes(version) ? ' · installed' : ''}</option>)}
            </select>
            <button type="button" onClick={() => void installVersion()} disabled={busy || !selectedVersion} className="rounded-md bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40">Install & use</button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Switching Zig may require a matching ZLS build.</p>
        </div>

        {busy && <p className="mt-3 text-xs text-violet-300">{progress || 'Working...'}</p>}
        {error && <p className="mt-3 break-words text-xs text-red-300">{error}</p>}

        <footer className="mt-5 flex gap-2">
          <button type="button" onClick={() => void installRecommended()} disabled={busy} className="flex-1 rounded-md border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-40">Install recommended</button>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md bg-white/10 px-4 py-2 text-xs text-gray-200 hover:bg-white/15">{ready ? 'Done' : 'Later'}</button>
        </footer>
        <p className="mt-3 text-[10px] text-gray-600">Official Zig downloads. No PATH changes.</p>
      </section>
    </div>
  );
}
