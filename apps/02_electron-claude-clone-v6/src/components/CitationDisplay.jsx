import React, { useState } from 'react';
import { ExternalLink, Calendar, TrendingUp, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Enhanced Citation Display with publisher logos
 */
export function CitationDisplay({ sources, searchQuery }) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!sources || sources.length === 0) return null;

    return (
        <div className="citations-container mt-4 pt-4 border-t border-[var(--border)]">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-3"
            >
                <Globe size={16} className="text-[var(--accent)]" />
                <span>{sources.length} {sources.length === 1 ? 'Source' : 'Sources'}</span>
                {searchQuery && (
                    <span className="text-[var(--text-tertiary)] font-normal">
                        for "{searchQuery}"
                    </span>
                )}
                <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Sources grid */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="grid gap-2 sm:grid-cols-2">
                            {sources.map((source) => (
                                <SourceCard key={source.id} source={source} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SourceCard({ source }) {
    const [imageError, setImageError] = useState(false);

    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-card group block p-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)]/50 hover:shadow-md transition-all duration-200"
        >
            {/* Header with logo and domain */}
            <div className="flex items-center gap-2.5 mb-2">
                {/* Logo */}
                <div className="w-6 h-6 rounded-md overflow-hidden bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                    {source.logo && !imageError ? (
                        <img
                            src={source.logo}
                            alt={source.domain || 'Source'}
                            className="w-full h-full object-contain"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <Globe size={14} className="text-[var(--text-tertiary)]" />
                    )}
                </div>

                {/* Domain and citation number */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-tertiary)] truncate">
                        {source.domain || new URL(source.url).hostname.replace('www.', '')}
                    </span>
                    <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">
                        [{source.id}]
                    </span>
                </div>

                {/* External link icon */}
                <ExternalLink size={14} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>

            {/* Title */}
            <h4 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2 leading-snug mb-1.5 group-hover:text-[var(--accent)] transition-colors">
                {source.title}
            </h4>

            {/* Snippet */}
            <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                {source.content}
            </p>

            {/* Meta info */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)]">
                {source.publishedDate && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <Calendar size={10} />
                        {new Date(source.publishedDate).toLocaleDateString()}
                    </span>
                )}
                {source.score !== undefined && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <TrendingUp size={10} />
                        {(source.score * 100).toFixed(0)}%
                    </span>
                )}
            </div>
        </a>
    );
}

export default CitationDisplay;
