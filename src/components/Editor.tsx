import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import type { EditorActions } from './TitleBar';

interface EditorProps {
  value: string;
  language: string;
  onChange: (value: string | undefined) => void;
  filePath?: string;
  workspaceRoot?: string;
  onActionsReady?: (actions: EditorActions) => void;
}

const registeredMonaco = new WeakSet<object>();
const registeredSemanticMonaco = new WeakSet<object>();

export default function CodeEditor({ value, language, onChange, filePath, workspaceRoot, onActionsReady }: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const documentVersion = useRef(1);
  const lspReady = useRef(false);

  useEffect(() => {
    if (language !== 'zig' || !filePath) return;
    let cancelled = false;
    lspReady.current = false;
    const root = workspaceRoot || filePath.replace(/[\\/][^\\/]+$/, '');
    void window.zigIDE.startZls(root)
      .then(() => window.zigIDE.openLspDocument(filePath, value))
      .then(() => { const monaco = monacoRef.current; if (monaco) void registerSemanticTokensProvider(monaco); })
      .then(() => { if (!cancelled) { lspReady.current = true; documentVersion.current = 1; } })
      .catch(error => { if (!cancelled) { console.warn('ZLS is unavailable:', error); void window.zigIDE.reportLspError(`ZLS unavailable: ${String(error)}`); } });
    return () => { cancelled = true; lspReady.current = false; };
  }, [filePath, workspaceRoot, language]);

  useEffect(() => {
    if (language !== 'zig' || !filePath || !lspReady.current) return;
    documentVersion.current += 1;
    void window.zigIDE.changeLspDocument(filePath, value, documentVersion.current).catch(() => undefined);
  }, [value, filePath, language]);

  useEffect(() => {
    if (!filePath) return;
    return window.zigIDE.onLspDiagnostics((params: any) => {
      const model = editorRef.current?.getModel();
      if (!model || model.uri.toString() !== params.uri) return;
      const monaco = monacoRef.current;
      if (!monaco) return;
      const markers = (params.diagnostics || []).map((item: any) => ({
        severity: item.severity === 1 ? monaco.MarkerSeverity.Error : item.severity === 2 ? monaco.MarkerSeverity.Warning : item.severity === 3 ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Hint,
        message: item.message,
        startLineNumber: item.range.start.line + 1,
        startColumn: item.range.start.character + 1,
        endLineNumber: item.range.end.line + 1,
        endColumn: item.range.end.character + 1,
        source: item.source || 'ZLS',
        code: item.code ? String(item.code) : undefined,
      }));
      monaco.editor.setModelMarkers(model, 'zls', markers);
    });
  }, [filePath]);

  const registerLspProviders = (monaco: typeof Monaco) => {
    if (registeredMonaco.has(monaco as object)) return;
    registeredMonaco.add(monaco as object);
    const position = (p: Monaco.Position) => ({ line: p.lineNumber - 1, character: p.column - 1 });
    monaco.languages.registerCompletionItemProvider('zig', {
      triggerCharacters: ['.', '@', ':'],
      provideCompletionItems: async (model, pos) => {
        try {
          const result = await window.zigIDE.requestLsp('textDocument/completion', { textDocument: { uri: model.uri.toString() }, position: position(pos) });
          const items = Array.isArray(result) ? result : (result?.items || []);
          const word = model.getWordUntilPosition(pos);
          const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
          return { suggestions: items.map((item: any) => ({
            label: typeof item.label === 'string' ? item.label : item.label.label,
            kind: item.kind || monaco.languages.CompletionItemKind.Text,
            detail: item.detail,
            documentation: typeof item.documentation === 'string' ? item.documentation : item.documentation?.value,
            insertText: item.insertText || item.label,
            insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : monaco.languages.CompletionItemInsertTextRule.None,
            filterText: item.filterText,
            sortText: item.sortText,
            range,
          })) };
        } catch { return { suggestions: [] }; }
      }
    });
    monaco.languages.registerHoverProvider('zig', {
      provideHover: async (model, pos) => {
        try {
          const result = await window.zigIDE.requestLsp('textDocument/hover', { textDocument: { uri: model.uri.toString() }, position: position(pos) });
          if (!result?.contents) return null;
          const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
          return { contents: contents.map((part: any) => ({ value: typeof part === 'string' ? part : part.value || '' })) };
        } catch { return null; }
      }
    });
    monaco.languages.registerDefinitionProvider('zig', {
      provideDefinition: async (model, pos) => {
        try {
          const result = await window.zigIDE.requestLsp('textDocument/definition', { textDocument: { uri: model.uri.toString() }, position: position(pos) });
          const locations = Array.isArray(result) ? result : result ? [result] : [];
          return locations.filter((loc: any) => loc?.uri && loc?.range).map((loc: any) => ({ uri: monaco.Uri.parse(loc.uri), range: new monaco.Range(loc.range.start.line + 1, loc.range.start.character + 1, loc.range.end.line + 1, loc.range.end.character + 1) }));
        } catch { return []; }
      }
    });
  };

  const registerSemanticTokensProvider = async (monaco: typeof Monaco) => {
    if (registeredSemanticMonaco.has(monaco as object)) return;
    const legend = await window.zigIDE.getZlsSemanticLegend().catch(() => null);
    if (!legend || !legend.tokenTypes?.length) return;
    registeredSemanticMonaco.add(monaco as object);
    monaco.languages.registerDocumentSemanticTokensProvider('zig', {
      getLegend: () => ({ tokenTypes: legend.tokenTypes, tokenModifiers: legend.tokenModifiers || [] }),
      provideDocumentSemanticTokens: async (model) => {
        try {
          const result = await window.zigIDE.requestLsp('textDocument/semanticTokens/full', {
            textDocument: { uri: model.uri.toString() }
          });
          if (!Array.isArray(result?.data)) return { data: new Uint32Array() };
          return { data: new Uint32Array(result.data), resultId: result.resultId };
        } catch {
          return { data: new Uint32Array() };
        }
      },
      releaseDocumentSemanticTokens: () => undefined,
    });
  };

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="zig"
        language={language}
        path={filePath ? (filePath.startsWith('/') ? `file://${encodeURI(filePath)}` : `file:///${encodeURI(filePath.replace(/\\/g, '/'))}`) : undefined}
        value={value}
        onChange={onChange}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 16, bottom: 16 },
          lineNumbersMinChars: 3,
          renderLineHighlight: 'line',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: false, indentation: true },
          tabSize: 4,
          insertSpaces: false,
          wordWrap: 'off',
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          folding: true,
          links: true,
          colorDecorators: true,
          contextmenu: true,
          mouseWheelZoom: true,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
            verticalSliderSize: 6,
          },
        }}
        beforeMount={(monaco) => {
          monaco.languages.register({ id: 'zig' });
          monaco.languages.registerCompletionItemProvider('zig', {
            triggerCharacters: ['.', '@', ':'],
            provideCompletionItems: (model, position) => {
              const word = model.getWordUntilPosition(position);
              const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
              const suggestions = [
                ...['pub','fn','const','var','if','else','while','for','switch','return','defer','errdefer','try','catch','struct','enum','union','opaque','extern','export','comptime','inline','test','break','continue','unreachable','true','false','null','undefined','and','or'].map(label => ({ label, kind: monaco.languages.CompletionItemKind.Keyword, insertText: label, range, detail: 'Zig keyword' })),
                ...['@import','@This','@TypeOf','@as','@intCast','@floatFromInt','@intFromFloat','@ptrCast','@alignCast','@sizeOf','@typeInfo','@compileError','@embedFile','@cImport','@panic'].map(label => ({ label, kind: monaco.languages.CompletionItemKind.Function, insertText: label, range, detail: 'Zig built-in function' })),
                { label: 'std', kind: monaco.languages.CompletionItemKind.Module, insertText: 'std', range, detail: 'Standard library' },
                { label: 'main function', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'pub fn main() void {\n\tstd.debug.print("Hello, world!\\n", .{});\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Main function template' },
                { label: 'if statement', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'if (${1:condition}) {\n\t$0\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Template if' },
                { label: 'for loop', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'for (${1:items}) |${2:item}| {\n\t$0\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Template for' },
                { label: 'const std', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'const std = @import("std");', range, detail: 'Import the standard library' },
              ];
              return { suggestions };
            }
          });
          monaco.languages.setMonarchTokensProvider('zig', {
            tokenizer: { root: [
              [/\b(pub|fn|const|var|if|else|while|for|return|break|continue|defer|errdefer|try|catch|switch|unreachable|struct|enum|union|opaque|extern|export|comptime|inline|noinline|test|async|await|suspend|resume|anytype|anyopaque|true|false|null|undefined)\b/, 'keyword'],
              [/\b(?:[ui][0-9]+|f(?:16|32|64|80|128)|usize|isize)\b/, 'type'],
              [/\b(void|bool|usize|isize|noreturn|type|anyerror)\b/, 'type'],
              [/\b[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?\b/, 'number'],
              [/\"([^\"\\]|\\.)*\"/, 'string'],
              [/\/\/.*$/, 'comment'],
              [/@[a-zA-Z_][\w]*/, 'annotation'],
              [/[{}()[\]]/, '@brackets'],
              [/[;,.]/, 'delimiter']
            ] }
          });
          monaco.editor.defineTheme('zig-ide', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'keyword', foreground: 'c4a7e7', fontStyle: '' },
              { token: 'keyword.control', foreground: 'c4a7e7' },
              { token: 'type', foreground: 'f6c177' },
              { token: 'type.identifier', foreground: 'f6c177' },
              { token: 'string', foreground: '9ccfd8' },
              { token: 'string.escape', foreground: '9ccfd8' },
              { token: 'number', foreground: 'f6c177' },
              { token: 'comment', foreground: '6e6a86', fontStyle: 'italic' },
              { token: 'comment.line', foreground: '6e6a86', fontStyle: 'italic' },
              { token: 'comment.block', foreground: '6e6a86', fontStyle: 'italic' },
              { token: 'identifier', foreground: 'e0def4' },
              { token: 'delimiter', foreground: '908caa' },
              { token: 'delimiter.parenthesis', foreground: '908caa' },
              { token: 'delimiter.bracket', foreground: '908caa' },
              { token: 'preprocessor', foreground: 'eb6f92' },
              { token: 'tag', foreground: 'eb6f92' },
            ],
            colors: {
              'editor.background': '#1a1a2e',
              'editor.foreground': '#e0def4',
              'editor.lineHighlightBackground': '#1f1f35',
              'editor.lineHighlightBorder': '#00000000',
              'editor.selectionBackground': '#313150',
              'editor.inactiveSelectionBackground': '#262640',
              'editorCursor.foreground': '#f6c177',
              'editorLineNumber.foreground': '#3d3d5c',
              'editorLineNumber.activeForeground': '#6e6a86',
              'editor.selectionHighlightBackground': '#31315040',
              'editorIndentGuide.background': '#262640',
              'editorIndentGuide.activeBackground': '#3d3d5c',
              'editorBracketMatch.background': '#31315040',
              'editorBracketMatch.border': '#6e6a8640',
              'editorGutter.background': '#1a1a2e',
              'minimap.background': '#16162a',
              'editorWidget.background': '#1f1f35',
              'editorWidget.border': '#313150',
              'editorSuggestWidget.background': '#1f1f35',
              'editorSuggestWidget.border': '#313150',
              'editorSuggestWidget.foreground': '#e0def4',
              'editorSuggestWidget.selectedBackground': '#313150',
              'editorHoverWidget.background': '#1f1f35',
              'editorHoverWidget.border': '#313150',
              'input.background': '#16162a',
              'input.border': '#313150',
              'scrollbarSlider.background': '#3d3d5c40',
              'scrollbarSlider.hoverBackground': '#3d3d5c60',
              'scrollbarSlider.activeBackground': '#3d3d5c80',
            },
          });
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          monaco.editor.setTheme('zig-ide');
          registerLspProviders(monaco);
          let wordWrap = false;
          let minimap = true;
          const trigger = (id: string) => { void editor.getAction(id)?.run(); };
          const runEditorAction = (id: string) => { editor.focus(); void editor.getAction(id)?.run(); };
          onActionsReady?.({
            undo: () => runEditorAction('undo'), redo: () => runEditorAction('redo'),
            cut: () => runEditorAction('editor.action.clipboardCutAction'),
            copy: () => runEditorAction('editor.action.clipboardCopyAction'),
            paste: () => runEditorAction('editor.action.clipboardPasteAction'),
            find: () => runEditorAction('actions.find'), replace: () => runEditorAction('editor.action.startFindReplaceAction'),
            selectAll: () => runEditorAction('editor.action.selectAll'),
            toggleComment: () => runEditorAction('editor.action.commentLine'),
            toggleWordWrap: () => { wordWrap = !wordWrap; editor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' }); editor.focus(); },
            toggleMinimap: () => { minimap = !minimap; editor.updateOptions({ minimap: { enabled: minimap } }); editor.focus(); },
          });
        }}
      />
    </div>
  );
}
