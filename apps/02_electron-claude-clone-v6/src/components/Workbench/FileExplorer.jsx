import React, { useState, useEffect } from 'react';
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, File, FileJson, FileType } from 'lucide-react';

export function FileExplorer({ webcontainerInstance, onFileSelect }) {
    const [files, setFiles] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set(['.']));
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState(null);

    const loadFiles = async () => {
        if (!webcontainerInstance) return;
        setIsLoading(true);
        try {
            const tree = await readDirRecursive(webcontainerInstance.fs, '.');
            setFiles(tree);
        } catch (error) {
            console.error('Failed to load files:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
        const interval = setInterval(loadFiles, 2000);
        return () => clearInterval(interval);
    }, [webcontainerInstance]);

    const toggleFolder = (path) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedFolders(newExpanded);
    };

    const handleSelect = (node) => {
        setSelectedPath(node.path);
        onFileSelect(node);
    };

    return (
        <div className="h-full flex flex-col bg-[#252526] border-r border-[#2b2b2b] w-60 text-sm select-none">
            <div className="h-12 border-b border-[#2b2b2b] flex items-center justify-between px-4 shrink-0">
                <span className="font-medium text-[#bbbbbb] text-xs uppercase tracking-wider">Explorer</span>
                <button onClick={loadFiles} className="p-1 hover:bg-[#37373d] rounded-md transition-colors text-[#cccccc]">
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                {files.map(node => (
                    <FileTreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        expandedFolders={expandedFolders}
                        onToggleFolder={toggleFolder}
                        onFileSelect={handleSelect}
                        selectedPath={selectedPath}
                    />
                ))}
                {files.length === 0 && !isLoading && (
                    <div className="text-center text-xs text-[#666666] mt-4">No files found</div>
                )}
            </div>
        </div>
    );
}

function FileTreeNode({ node, depth, expandedFolders, onToggleFolder, onFileSelect, selectedPath }) {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedPath === node.path;
    const paddingLeft = `${depth * 12 + 12}px`;

    // Icon selection
    const getIcon = () => {
        if (node.type === 'folder') return <Folder size={14} className="text-[#dcb67a]" />;
        if (node.name.endsWith('.jsx') || node.name.endsWith('.js')) return <FileCode size={14} className="text-[#4ec9b0]" />;
        if (node.name.endsWith('.json')) return <FileJson size={14} className="text-[#ce9178]" />;
        if (node.name.endsWith('.css')) return <FileType size={14} className="text-[#569cd6]" />;
        return <File size={14} className="text-[#cccccc]" />;
    };

    if (node.type === 'folder') {
        return (
            <div>
                <div
                    className={`flex items-center gap-1.5 py-1 cursor-pointer transition-colors ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}`}
                    style={{ paddingLeft }}
                    onClick={() => onToggleFolder(node.path)}
                >
                    <span className="text-[#cccccc]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    {getIcon()}
                    <span className="truncate">{node.name}</span>
                </div>
                {isExpanded && node.children.map(child => (
                    <FileTreeNode
                        key={child.path}
                        node={child}
                        depth={depth + 1}
                        expandedFolders={expandedFolders}
                        onToggleFolder={onToggleFolder}
                        onFileSelect={onFileSelect}
                        selectedPath={selectedPath}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className={`flex items-center gap-1.5 py-1 cursor-pointer transition-colors ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}`}
            style={{ paddingLeft }}
            onClick={() => onFileSelect(node)}
        >
            <span className="w-3.5"></span>
            {getIcon()}
            <span className="truncate">{node.name}</span>
        </div>
    );
}

async function readDirRecursive(fs, path) {
    try {
        const entries = await fs.readdir(path, { withFileTypes: true });
        const result = [];

        entries.sort((a, b) => {
            if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
            return a.isDirectory() ? -1 : 1;
        });

        for (const entry of entries) {
            const fullPath = path === '.' ? entry.name : `${path}/${entry.name}`;
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules') {
                    result.push({
                        name: entry.name,
                        path: fullPath,
                        type: 'folder',
                        children: []
                    });
                } else {
                    result.push({
                        name: entry.name,
                        path: fullPath,
                        type: 'folder',
                        children: await readDirRecursive(fs, fullPath)
                    });
                }
            } else {
                result.push({
                    name: entry.name,
                    path: fullPath,
                    type: 'file'
                });
            }
        }
        return result;
    } catch (e) {
        console.error(`Error reading directory ${path}:`, e);
        return [];
    }
}
