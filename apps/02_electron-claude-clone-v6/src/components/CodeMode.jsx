import { useState, useEffect } from 'react';
import { useMode } from '../context/ModeContext';
import MonacoEditor from '@monaco-editor/react';
import FileExplorer from './FileExplorer';
import PreviewPanel from './PreviewPanel';
import { Save, AlertCircle } from 'lucide-react';

export default function CodeMode() {
    const { codeState, setCodeState } = useMode();
    const [previewKey, setPreviewKey] = useState(0);

    // Initial dummy data for testing UI if empty
    useEffect(() => {
        if (Object.keys(codeState.files || {}).length === 0) {
            setCodeState(prev => ({
                ...prev,
                files: {
                    'src/App.jsx': '// Welcome to Code Mode\n\nexport default function App() {\n  return <h1>Hello World</h1>;\n}',
                    'src/index.css': 'body { background: #f0f0f0; }',
                    'package.json': '{\n  "name": "demo"\n}'
                },
                activeFile: 'src/App.jsx'
            }));
        }
    }, []);

    const handleFileSelect = (filePath) => {
        setCodeState(prev => ({
            ...prev,
            activeFile: filePath
        }));
    };

    const handleCodeChange = (newCode) => {
        if (!codeState.activeFile) return;

        setCodeState(prev => ({
            ...prev,
            files: {
                ...prev.files,
                [prev.activeFile]: newCode
            },
            unsavedChanges: true
        }));
    };

    const handleSave = async () => {
        // In a real app, this would write to the filesystem via an API
        console.log('Saving files...', codeState.files);

        setCodeState(prev => ({
            ...prev,
            unsavedChanges: false
        }));

        // Refresh preview
        setPreviewKey(prev => prev + 1);
    };

    return (
        <div className="code-mode h-full flex flex-col bg-[var(--bg-primary)]">
            {/* Header / Toolbar */}
            <div className="code-header flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] h-12">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">Editor</span>
                    {codeState.unsavedChanges && (
                        <div className="flex items-center gap-1.5 text-xs text-orange-500 font-medium px-2 py-0.5 bg-orange-500/10 rounded-full">
                            <AlertCircle size={12} />
                            <span>Unsaved changes</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                        ${codeState.unsavedChanges
                            ? 'bg-[var(--accent)] text-white hover:bg-blue-600 shadow-sm'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-disabled)] cursor-not-allowed'
                        }
                    `}
                    disabled={!codeState.unsavedChanges}
                >
                    <Save size={14} />
                    Save
                </button>
            </div>

            {/* Main Layout: 3 Panels */}
            <div className="code-body flex-1 flex overflow-hidden">
                {/* Left: File Explorer */}
                <div className="file-explorer w-64 border-r border-[var(--border)] flex-shrink-0 bg-[var(--bg-secondary)]/50">
                    <FileExplorer
                        files={codeState.files}
                        activeFile={codeState.activeFile}
                        onFileSelect={handleFileSelect}
                    />
                </div>

                {/* Middle: Code Editor */}
                <div className="editor-panel flex-1 flex flex-col min-w-0">
                    {/* Tab Bar */}
                    <div className="editor-tabs flex gap-1 px-0 border-b border-[var(--border)] bg-[var(--bg-primary)] overflow-x-auto scroolbar-hide">
                        {codeState.activeFile ? (
                            <div className="tab px-4 py-2 bg-[var(--bg-secondary)] border-r border-[var(--border)] text-sm font-mono text-[var(--accent)] border-t-2 border-t-[var(--accent)] min-w-fit">
                                {codeState.activeFile.split('/').pop()}
                            </div>
                        ) : (
                            <div className="px-4 py-2 text-sm text-[var(--text-tertiary)] italic">No file selected</div>
                        )}
                    </div>

                    <div className="flex-1 relative">
                        {codeState.activeFile ? (
                            <MonacoEditor
                                height="100%"
                                language={getLanguage(codeState.activeFile)}
                                value={codeState.files[codeState.activeFile] || ''}
                                onChange={handleCodeChange}
                                theme="vs-dark"
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 16, bottom: 16 },
                                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                    fontLigatures: true
                                }}
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
                                <CodeModePlaceholder />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Live Preview */}
                <div className="preview-panel w-[400px] border-l border-[var(--border)] flex-shrink-0 hidden xl:block">
                    <PreviewPanel
                        key={previewKey}
                        previewUrl="http://localhost:5173"
                        onRefresh={() => setPreviewKey(k => k + 1)}
                    />
                </div>
            </div>
        </div>
    );
}

function getLanguage(filePath) {
    if (!filePath) return 'javascript';
    const ext = filePath.split('.').pop();
    const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'css': 'css',
        'html': 'html',
        'json': 'json',
        'md': 'markdown'
    };
    return langMap[ext] || 'javascript';
}

function CodeModePlaceholder() {
    return (
        <div className="text-center opacity-40">
            <svg
                className="w-16 h-16 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <p className="text-lg font-medium">Select a file to edit</p>
        </div>
    );
}
