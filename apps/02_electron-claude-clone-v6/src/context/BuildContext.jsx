import React, { createContext, useContext, useState, useCallback } from 'react';

const BuildContext = createContext();

const defaultFiles = {
    'src/App.tsx': `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Build Mode
        </h1>
        <p className="text-gray-600">
          Ask the assistant to generate some code!
        </p>
      </div>
    </div>
  );
}`,
    'src/index.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`
};

export function BuildProvider({ children }) {
    const [buildMessages, setBuildMessages] = useState([]);
    const [buildFiles, setBuildFiles] = useState(defaultFiles);
    const [activeFile, setActiveFile] = useState('src/App.tsx');
    const [isGenerating, setIsGenerating] = useState(false);

    const addBuildMessage = useCallback((message) => {
        setBuildMessages(prev => [...prev, {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            ...message
        }]);
    }, []);

    const updateBuildFiles = useCallback((newFiles) => {
        setBuildFiles(prev => ({
            ...prev,
            ...newFiles
        }));
    }, []);

    const clearBuild = useCallback(() => {
        setBuildMessages([]);
        setBuildFiles(defaultFiles);
        setActiveFile('src/App.tsx');
    }, []);

    const value = {
        buildMessages,
        addBuildMessage,
        buildFiles,
        updateBuildFiles,
        activeFile,
        setActiveFile,
        isGenerating,
        setIsGenerating,
        clearBuild
    };

    return (
        <BuildContext.Provider value={value}>
            {children}
        </BuildContext.Provider>
    );
}

export function useBuild() {
    const context = useContext(BuildContext);
    if (!context) {
        throw new Error('useBuild must be used within a BuildProvider');
    }
    return context;
}
