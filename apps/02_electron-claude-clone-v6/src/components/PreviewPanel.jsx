import { RefreshCw, ExternalLink } from 'lucide-react';

export default function PreviewPanel({ previewUrl, onRefresh }) {
    return (
        <div className="h-full flex flex-col bg-white border-l border-[var(--border)]">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Preview</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRefresh}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Refresh Preview"
                    >
                        <RefreshCw size={14} />
                    </button>
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            title="Open in new tab"
                        >
                            <ExternalLink size={14} />
                        </a>
                    )}
                </div>
            </div>

            <div className="flex-1 bg-white relative">
                {previewUrl ? (
                    <iframe
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title="Application Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-tertiary)] p-4 text-center">
                        <p>Preview not available</p>
                        <p className="text-xs mt-2">Start the dev server or generate code to see preview</p>
                    </div>
                )}
            </div>
        </div>
    );
}
