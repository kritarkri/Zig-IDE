import { useState, useRef, useEffect, useCallback } from 'react';

interface TerminalProps {
  output: string[];
  onCommand: (command: string, terminalId: string) => void;
  height: number;
  onResize: (height: number) => void;
  cwd?: string;
  onClearOutput: () => void;
}

type PanelTab = 'terminal' | 'problems' | 'output' | 'debug';
type TerminalSession = { id: string; name: string; output: string; running: boolean };

export default function Terminal({ output, onCommand, height, onResize, cwd, onClearOutput }: TerminalProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tab, setTab] = useState<PanelTab>('terminal');
  const [sessions, setSessions] = useState<TerminalSession[]>([{ id: 'terminal-1', name: 'Terminal 1', output: '', running: true }]);
  const [activeSessionId, setActiveSessionId] = useState('terminal-1');
  const outputRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionsRef = useRef<TerminalSession[]>(sessions);
  const mirroredOutputCount = useRef(0);
  sessionsRef.current = sessions;
  const drag = useRef({ active: false, y: 0, height: 0 });
  const activeSession = sessions.find(session => session.id === activeSessionId) || sessions[0];

  useEffect(() => {
    const off = window.zigIDE.onTerminalData(({ id, data }) => {
      setSessions(current => current.map(session => session.id === id ? { ...session, output: session.output + data, running: true } : session));
    });
    void window.zigIDE.startTerminal(cwd, 'terminal-1').catch(error => {
      setSessions(current => current.map(session => session.id === 'terminal-1' ? { ...session, output: `Terminal startup failed: ${String(error)}\n`, running: false } : session));
    });
    return () => { off(); sessionsRef.current.forEach(session => { void window.zigIDE.stopTerminal(session.id); }); };
  // The terminal processes are owned by this panel and cleaned up when it unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fresh = output.slice(mirroredOutputCount.current);
    mirroredOutputCount.current = output.length;
    if (fresh.length) {
      const text = fresh.join('\r\n') + '\r\n';
      setSessions(current => current.map(session => session.id === activeSessionId ? { ...session, output: session.output + text } : session));
    }
  }, [output, activeSessionId]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output, activeSession?.output, tab]);

  const createTerminal = async () => {
    const id = `terminal-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const number = sessions.length + 1;
    setSessions(current => [...current, { id, name: `Terminal ${number}`, output: '', running: true }]);
    setActiveSessionId(id);
    try { await window.zigIDE.startTerminal(cwd, id); }
    catch (error) { setSessions(current => current.map(session => session.id === id ? { ...session, output: `Terminal startup failed: ${String(error)}\n`, running: false } : session)); }
  };

  const closeTerminal = async (id: string) => {
    await window.zigIDE.stopTerminal(id);
    setSessions(current => {
      const remaining = current.filter(session => session.id !== id);
      if (!remaining.length) {
        void window.zigIDE.startTerminal(cwd, 'terminal-1').catch(() => undefined);
        setActiveSessionId('terminal-1');
        return [{ id: 'terminal-1', name: 'Terminal 1', output: '', running: true }];
      }
      if (activeSessionId === id) setActiveSessionId(remaining[remaining.length - 1].id);
      return remaining;
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const command = input;
    if (!command.trim() || !activeSession) return;
    setHistory(items => [...items, command]);
    setHistoryIndex(-1);
    setInput('');
    onCommand(command, activeSession.id);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next); setInput(history[next]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex < 0) return;
      const next = historyIndex + 1;
      if (next >= history.length) { setHistoryIndex(-1); setInput(''); }
      else { setHistoryIndex(next); setInput(history[next]); }
    }
  };

  const onMove = useCallback((event: MouseEvent) => {
    if (!drag.current.active) return;
    onResize(Math.max(110, Math.min(520, drag.current.height + drag.current.y - event.clientY)));
  }, [onResize]);
  const onUp = useCallback(() => {
    drag.current.active = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }, [onMove]);
  const startResize = (event: React.MouseEvent) => {
    drag.current = { active: true, y: event.clientY, height };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    event.preventDefault();
  };

  const diagnostics = output.filter(line => /(?:error|warning):/i.test(line) || /:\d+:\d+:/.test(line));
  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'terminal', label: 'Terminal' }, { id: 'problems', label: `Problems${diagnostics.length ? ` (${diagnostics.length})` : ''}` },
    { id: 'output', label: 'Output' }, { id: 'debug', label: 'Debug Console' }
  ];

  return (
    <section className="flex flex-col shrink-0" style={{ height, background: '#12121f', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div onMouseDown={startResize} className="h-[4px] shrink-0 cursor-row-resize hover:bg-violet-500/40" />
      <header className="flex items-center justify-between px-3 h-9 shrink-0" style={{ background: '#16162a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <nav className="flex items-center gap-1" aria-label="Bottom panel">
          {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`px-2 py-1 rounded text-[11px] ${tab === item.id ? 'text-violet-300 bg-violet-500/10' : 'text-gray-500 hover:text-gray-300'}`}>{item.label}</button>)}
        </nav>
        <div className="flex items-center gap-1">
          {tab === 'terminal' && <button type="button" title="Create terminal" onClick={() => void createTerminal()} className="px-2 py-1 text-gray-500 hover:text-gray-200"><i className="fas fa-plus text-[10px]" /></button>}
          {tab === 'terminal' && <button type="button" title="Focus command input" onClick={() => inputRef.current?.focus()} className="px-2 py-1 text-gray-500 hover:text-gray-200"><i className="fas fa-terminal text-[10px]" /></button>}
          <button type="button" title="Clear panel" onClick={() => { if (tab === 'terminal' && activeSession) setSessions(current => current.map(session => session.id === activeSession.id ? { ...session, output: '' } : session)); else onClearOutput(); }} className="px-2 py-1 text-gray-500 hover:text-gray-200"><i className="fas fa-trash text-[10px]" /></button>
        </div>
      </header>
      {tab === 'terminal' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-1 px-2 shrink-0 overflow-x-auto" style={{ background: '#141425', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {sessions.map(session => <div key={session.id} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b-2 ${session.id === activeSessionId ? 'text-gray-200 border-violet-400' : 'text-gray-500 border-transparent'}`}>
              <button type="button" onClick={() => setActiveSessionId(session.id)}>{session.name}</button>
              <button type="button" aria-label={`Close ${session.name}`} onClick={() => void closeTerminal(session.id)} className="hover:text-red-300">×</button>
            </div>)}
          </div>
          <div className="flex-1 min-h-0 flex flex-col px-4 py-2 font-mono text-xs" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <pre ref={outputRef} tabIndex={0} style={{ userSelect: 'text', WebkitUserSelect: 'text' }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); const node = outputRef.current; if (node) { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } } }} className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words select-text outline-none text-gray-400">{activeSession?.output || ''}</pre>
            <form onSubmit={submit} className="flex items-center shrink-0 pt-1">
              <span className="text-emerald-400 mr-2">›</span>
              <input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={handleInputKeyDown} className="flex-1 min-w-0 bg-transparent outline-none text-gray-200" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Terminal command" />
            </form>
          </div>
        </div>
      ) : tab === 'problems' ? (
        <div className="flex-1 overflow-auto px-4 py-2 font-mono text-xs text-gray-400 select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
          {diagnostics.length ? diagnostics.map((line, index) => <pre key={index} className="py-1 text-red-300 whitespace-pre-wrap break-words select-text">{line}</pre>) : <div className="text-gray-600">No problems detected in compiler output.</div>}
        </div>
      ) : tab === 'debug' ? (
        <div className="flex-1 overflow-auto px-4 py-3 text-xs text-gray-500 select-text" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}><div className="text-gray-300 mb-1">Debug Console</div><p className="select-text">Debug adapter support is not configured yet. Run and test output is available in the Output tab.</p></div>
      ) : (
        <pre ref={outputRef} tabIndex={0} style={{ userSelect: 'text', WebkitUserSelect: 'text' }} className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words select-text outline-none px-4 py-2 font-mono text-xs text-gray-400">{output.join('\n')}</pre>
      )}
    </section>
  );
}
