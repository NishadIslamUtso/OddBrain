import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';

export default function FileExplorer({ files, activeFile, onFileSelect }) {
    const [expandedFolders, setExpandedFolders] = useState(new Set(['src']));

    // Build file tree structure
    const fileTree = buildFileTree(Object.keys(files || {}));

    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const renderTree = (node, path = '') => {
        if (node.type === 'file') {
            const fullPath = path ? `${path}/${node.name}` : node.name;
            const isActive = activeFile === fullPath;
            return (
                <div
                    key={fullPath}
                    onClick={() => onFileSelect(fullPath)}
                    className={`
                        flex items-center gap-2 px-2 py-1.5 cursor-pointer
                        rounded-md transition-colors text-sm
                        ${isActive
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                        }
                    `}
                >
                    <File size={14} className={isActive ? 'text-white' : 'text-[var(--text-tertiary)]'} />
                    <span className="truncate">{node.name}</span>
                </div>
            );
        }

        // Folder
        const fullPath = path ? `${path}/${node.name}` : node.name;
        // Check if expanded. Root folders might be handled differently or strictly by path.
        // If we want 'src' to be expanded by default, we need to match how we construct the path.
        const isExpanded = expandedFolders.has(fullPath) || node.name === 'root';

        // Special case for root if we want it invisible or always expanded
        if (node.name === 'root') {
            return (
                <div key="root">
                    {Object.entries(node.children).map(([name, child]) =>
                        renderTree(child, '')
                    )}
                </div>
            );
        }

        return (
            <div key={fullPath}>
                <div
                    onClick={() => toggleFolder(fullPath)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--bg-hover)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] select-none"
                >
                    {isExpanded ?
                        <ChevronDown size={14} /> :
                        <ChevronRight size={14} />
                    }
                    <Folder size={14} className="text-[var(--accent)]" />
                    <span className="text-sm font-medium">{node.name}</span>
                </div>
                {isExpanded && (
                    <div className="ml-4 border-l border-[var(--border)] pl-1">
                        {Object.entries(node.children).map(([name, child]) =>
                            renderTree(child, fullPath)
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-2 h-full overflow-y-auto">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3 px-2">Explorer</h3>
            {Object.keys(files || {}).length === 0 ? (
                <div className="text-sm text-[var(--text-tertiary)] px-2 italic">No files open</div>
            ) : (
                renderTree(fileTree)
            )}
        </div>
    );
}

function buildFileTree(filePaths) {
    const root = { type: 'folder', name: 'root', children: {} };

    filePaths.sort().forEach(path => {
        const parts = path.split('/');
        let current = root;

        parts.forEach((part, idx) => {
            if (idx === parts.length - 1) {
                current.children[part] = { type: 'file', name: part };
            } else {
                if (!current.children[part]) {
                    current.children[part] = {
                        type: 'folder',
                        name: part,
                        children: {}
                    };
                }
                current = current.children[part];
            }
        });
    });

    return root;
}
