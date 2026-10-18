import React from 'react';
import { Search, Loader2, CheckCircle } from 'lucide-react';

export function SearchIndicator({ searchQuery, isSearching = true, searchNumber = null, totalSearches = null, sourcesFound = null }) {
    if (!searchQuery && !isSearching) return null;

    const showProgress = searchNumber && totalSearches;
    const isComplete = !isSearching && sourcesFound !== null;

    return (
        <div className="search-indicator">
            {isComplete ? (
                <CheckCircle size={16} className="text-green-600" />
            ) : isSearching ? (
                <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
            ) : (
                <Search size={16} className="text-[var(--accent)]" />
            )}
            <span className="search-query-text">
                {showProgress && <strong>Search {searchNumber} of {totalSearches}: </strong>}
                {isComplete ? (
                    <>Complete: <strong>"{searchQuery}"</strong> - {sourcesFound} sources found</>
                ) : isSearching ? (
                    <>Searching: <strong>"{searchQuery}"</strong></>
                ) : (
                    <>Searched for: <strong>"{searchQuery}"</strong></>
                )}
            </span>
        </div>
    );
}
