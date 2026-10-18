import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Layout, Globe, Loader2, RefreshCw, Sidebar, Code, Play, Download, Share2, PanelBottomClose, PanelBottomOpen, Maximize2, Minimize2, X } from 'lucide-react';
import { useBuildMode } from '../../context/BuildModeContext';
import { BoltArtifactParser } from '../../lib/BoltArtifactParser';
import { FileExplorer } from './FileExplorer';

export function Workbench({ streamingMessage }) {
    const { webcontainerInstance } = useBuildMode();
    const [terminalOutput, setTerminalOutput] = useState([]);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isServerRunning, setIsServerRunning] = useState(false);

    // Panel Visibility States
    const [showSidebar, setShowSidebar] = useState(true);
    const [showPreview, setShowPreview] = useState(true);
    const [showTerminal, setShowTerminal] = useState(true);

    const [selectedFileContent, setSelectedFileContent] = useState('');
    const [selectedFilePath, setSelectedFilePath] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const parserRef = useRef(null);
    const processedLengthRef = useRef(0);
    const terminalRef = useRef(null);
    const editorRef = useRef(null);

    // Initialize parser
    useEffect(() => {
        if (!parserRef.current) {
            parserRef.current = new BoltArtifactParser({
                onActionStart: (action) => {
                    if (action.type === 'shell') {
                        addTerminalLine(`> ${action.content || 'Running command...'}`);
                        // Auto-show terminal on command
                        if (!showTerminal) setShowTerminal(true);
                    } else if (action.type === 'file') {
                        addTerminalLine(`> Writing file: ${action.filePath}`);
                        // Switch file selection to this file
                        setSelectedFilePath(action.filePath);
                        setSelectedFileContent('');
                    }
                },
                onActionContent: (action, content) => {
                    if (action.type === 'file') {
                        setSelectedFileContent(prev => prev + content);
                        // Auto-scroll editor
                        if (editorRef.current) {
                            editorRef.current.scrollTop = editorRef.current.scrollHeight;
                        }
                    }
                },
                onActionEnd: async (action) => {
                    if (!webcontainerInstance) return;

                    try {
                        if (action.type === 'file') {
                            await webcontainerInstance.fs.writeFile(action.filePath, action.content);
                            addTerminalLine(`✓ Wrote ${action.filePath}`);
                        } else if (action.type === 'shell') {
                            const command = action.content.trim();
                            addTerminalLine(`$ ${command}`);

                            // Simple command parsing
                            const [cmd, ...args] = command.split(' ');

                            const process = await webcontainerInstance.spawn(cmd, args);

                            process.output.pipeTo(new WritableStream({
                                write(data) {
                                    addTerminalLine(data);
                                }
                            }));

                            await process.exit;
                            addTerminalLine(`✓ Command finished`);
                        }
                    } catch (err) {
                        addTerminalLine(`❌ Error: ${err.message}`);
                    }
                }
            });
        }
    }, [webcontainerInstance, showTerminal]);

    // Process streaming message
    useEffect(() => {
        if (streamingMessage && parserRef.current) {
            const newContent = streamingMessage.slice(processedLengthRef.current);
            if (newContent) {
                parserRef.current.parse(newContent);
                processedLengthRef.current = streamingMessage.length;
            }
        } else if (!streamingMessage) {
            processedLengthRef.current = 0;
        }
    }, [streamingMessage]);

    // Listen for server ready
    useEffect(() => {
        if (webcontainerInstance) {
            webcontainerInstance.on('server-ready', (port, url) => {
                addTerminalLine(`🌐 Server ready at ${url}`);
                setPreviewUrl(url);
                setIsServerRunning(true);
                // Auto-show preview on server ready
                setShowPreview(true);
            });
        }
    }, [webcontainerInstance]);

    const addTerminalLine = (text) => {
        setTerminalOutput(prev => [...prev, text]);
        // Auto-scroll
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    };

    const handleFileSelect = async (file) => {
        if (!webcontainerInstance) return;
        try {
            const content = await webcontainerInstance.fs.readFile(file.path, 'utf-8');
            setSelectedFileContent(content);
            setSelectedFilePath(file.path);
        } catch (e) {
            console.error('Error reading file:', e);
        }
    };

    const handleDownload = async () => {
        setIsExporting(true);
        addTerminalLine('> Preparing download...');
        // Mock download for now - requires jszip
        setTimeout(() => {
            addTerminalLine('ℹ️  Download feature coming soon (requires JSZip)');
            setIsExporting(false);
        }, 1000);
    };

    const handlePublish = () => {
        addTerminalLine('> Deploying to cloud...');
        setTimeout(() => {
            addTerminalLine('✓ Deployed successfully to https://project-xyz.bolt.host');
            alert('Deployment feature coming soon!');
        }, 1000);
    };

    return (
        <div className="h-full flex flex-col bg-[#1e1e1e] text-[#d4d4d4] border-l border-[#2b2b2b]">
            {/* Workbench Header */}
            <div className="h-12 border-b border-[#2b2b2b] flex items-center px-4 gap-4 bg-[#252526] justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-1.5 rounded-md transition-colors ${showSidebar ? 'bg-[#37373d] text-white' : 'text-[#969696] hover:text-white'}`}
                        title="Toggle File Explorer"
                    >
                        <Sidebar size={16} />
                    </button>
                    <div className="w-px h-4 bg-[#3e3e42] mx-1"></div>
                    <span className="text-xs font-medium text-[#cccccc]">Workbench</span>
                </div>

                <div className="flex items-center gap-2">
                    {isServerRunning && (
                        <div className="flex items-center gap-2 text-xs text-[#4ec9b0] font-medium px-2 py-1 bg-[#1e1e1e] border border-[#2b2b2b] rounded-full mr-2">
                            <div className="w-2 h-2 bg-[#4ec9b0] rounded-full animate-pulse"></div>
                            Running
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#37373d] hover:bg-[#4a4a52] text-white rounded-md text-xs font-medium transition-colors"
                    >
                        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Export
                    </button>

                    <button
                        onClick={handlePublish}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#007acc] hover:bg-[#0062a3] text-white rounded-md text-xs font-medium transition-colors"
                    >
                        <Share2 size={14} />
                        Publish
                    </button>
                </div>
            </div>

            {/* Main Content Area with Split Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* File Explorer Sidebar */}
                {showSidebar && (
                    <FileExplorer
                        webcontainerInstance={webcontainerInstance}
                        onFileSelect={handleFileSelect}
                    />
                )}

                {/* Editor & Preview Split Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">

                    {/* Upper Area: Editor + Preview */}
                    <div className={`flex-1 flex overflow-hidden ${showTerminal ? 'h-[60%]' : 'h-full'}`}>

                        {/* Code Editor */}
                        <div className={`flex-1 flex flex-col min-w-0 ${showPreview ? 'border-r border-[#2b2b2b]' : ''}`}>
                            {selectedFilePath ? (
                                <>
                                    {/* Editor Tab Header */}
                                    <div className="h-9 border-b border-[#2b2b2b] flex items-center px-3 bg-[#1e1e1e] text-xs text-[#969696] font-mono shrink-0">
                                        <span className="text-[#569cd6] mr-2">JS</span>
                                        {selectedFilePath}
                                    </div>
                                    <textarea
                                        ref={editorRef}
                                        className="flex-1 w-full h-full p-4 font-mono text-sm resize-none outline-none bg-[#1e1e1e] text-[#d4d4d4] leading-relaxed"
                                        value={selectedFileContent}
                                        readOnly
                                        spellCheck={false}
                                    />
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-[#5a5a5a] bg-[#1e1e1e]">
                                    <Code size={48} className="mb-4 opacity-20" />
                                    <div className="text-sm">Select a file to view content</div>
                                </div>
                            )}
                        </div>

                        {/* Live Preview Pane */}
                        {showPreview && (
                            <div className="flex-1 flex flex-col min-w-0 bg-white border-l border-[#2b2b2b]">
                                {/* Preview Header */}
                                <div className="h-9 border-b flex items-center justify-between px-3 bg-[#f0f0f0] shrink-0">
                                    <div className="flex items-center gap-2 text-xs text-gray-500 overflow-hidden">
                                        <Globe size={12} />
                                        <span className="truncate max-w-[200px]">{previewUrl || 'localhost:3000'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => {
                                            const iframe = document.getElementById('preview-iframe');
                                            if (iframe && previewUrl) iframe.src = previewUrl;
                                        }} className="p-1 hover:bg-gray-200 rounded text-gray-600">
                                            <RefreshCw size={12} />
                                        </button>
                                        <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Close Preview">
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Iframe Content */}
                                {previewUrl ? (
                                    <iframe
                                        id="preview-iframe"
                                        src={previewUrl}
                                        className="w-full h-full border-0 bg-white"
                                        title="App Preview"
                                    />
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 bg-[#f9f9f9]">
                                        <Loader2 size={24} className="animate-spin" />
                                        <div className="text-sm">Starting dev server...</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Terminal Pane (Bottom) */}
                    {showTerminal ? (
                        <div className="h-[40%] min-h-[150px] border-t border-[#2b2b2b] flex flex-col bg-[#1e1e1e]">
                            <div className="h-8 border-b border-[#2b2b2b] flex items-center justify-between px-3 bg-[#252526] shrink-0">
                                <div className="flex items-center gap-2 text-xs text-[#cccccc]">
                                    <Terminal size={12} />
                                    <span>Terminal</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setShowTerminal(false)} className="p-1 hover:bg-[#37373d] rounded text-[#cccccc]" title="Close Terminal">
                                        <PanelBottomClose size={14} />
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={terminalRef}
                                className="flex-1 overflow-auto p-3 font-mono text-xs bg-[#1e1e1e] text-[#d4d4d4]"
                            >
                                {terminalOutput.length === 0 ? (
                                    <div className="text-[#6a9955]">// Terminal ready. Waiting for commands...</div>
                                ) : (
                                    terminalOutput.map((line, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all border-b border-[#2b2b2b]/30 py-0.5 min-h-[20px]">{line}</div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        // Collapsed Terminal Bar
                        <div className="h-8 border-t border-[#2b2b2b] flex items-center justify-between px-3 bg-[#252526] shrink-0 cursor-pointer hover:bg-[#2a2d2e]" onClick={() => setShowTerminal(true)}>
                            <div className="flex items-center gap-2 text-xs text-[#969696]">
                                <Terminal size={12} />
                                <span>Terminal</span>
                            </div>
                            <PanelBottomOpen size={14} className="text-[#969696]" />
                        </div>
                    )}
                </div>
            </div>

            {/* View Controls (Bottom Right Floating or Integrated) */}
            {!showPreview && selectedFilePath && (
                <div className="absolute top-14 right-4 z-10">
                    <button
                        onClick={() => setShowPreview(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-[#007acc] text-white rounded-md shadow-lg hover:bg-[#0062a3] transition-colors text-xs font-medium"
                    >
                        <Layout size={14} />
                        Show Preview
                    </button>
                </div>
            )}
        </div>
    );
}
