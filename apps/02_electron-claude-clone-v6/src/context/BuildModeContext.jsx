import React, { createContext, useContext, useState, useCallback } from 'react';
import { useWebContainer } from '../hooks/useWebContainer';

const BuildModeContext = createContext();

export function BuildModeProvider({ children }) {
    const [isBuildMode, setIsBuildMode] = useState(false);
    // Use the hook to manage the WebContainer instance
    const { webcontainerInstance, isLoading: isWebContainerLoading, error: webContainerError } = useWebContainer();

    const toggleBuildMode = useCallback(() => {
        setIsBuildMode(prev => {
            const newValue = !prev;
            console.log(`🔧 Build Mode: ${newValue ? 'ON' : 'OFF'}`);
            return newValue;
        });
    }, []);

    const value = {
        isBuildMode,
        setIsBuildMode,
        toggleBuildMode,
        webcontainerInstance,
        isWebContainerLoading,
        webContainerError
    };

    return (
        <BuildModeContext.Provider value={value}>
            {children}
        </BuildModeContext.Provider>
    );
}

export function useBuildMode() {
    const context = useContext(BuildModeContext);
    if (!context) {
        throw new Error('useBuildMode must be used within a BuildModeProvider');
    }
    return context;
}
