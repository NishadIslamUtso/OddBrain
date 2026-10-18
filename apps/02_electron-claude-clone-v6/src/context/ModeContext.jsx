import { createContext, useContext, useState } from 'react';

const ModeContext = createContext();

export const MODES = {
    CHAT: 'chat',      // Normal conversation interface
    CODE: 'code',      // Code editor interface
    BUILD: 'build'     // Advanced build/deploy interface (future)
};

export function ModeProvider({ children }) {
    const [currentMode, setCurrentMode] = useState(MODES.CHAT);

    // Separate state for different modes
    const [chatState, setChatState] = useState({
        // Chat specific state if needed to be persisted here
        // Currently most chat state is in ChatContext, but this can hold view-specific state
    });

    const [codeState, setCodeState] = useState({
        files: {},
        activeFile: null,
        expandedFolders: new Set(['src']),
        unsavedChanges: false
    });

    return (
        <ModeContext.Provider value={{
            currentMode,
            setCurrentMode,
            chatState,
            setChatState,
            codeState,
            setCodeState
        }}>
            {children}
        </ModeContext.Provider>
    );
}

export const useMode = () => {
    const context = useContext(ModeContext);
    if (!context) {
        throw new Error('useMode must be used within a ModeProvider');
    }
    return context;
};
