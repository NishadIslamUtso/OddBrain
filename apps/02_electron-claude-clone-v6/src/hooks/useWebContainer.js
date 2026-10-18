import { useState, useEffect, useRef } from 'react';
import { WebContainer } from '@webcontainer/api';

/**
 * Custom hook to manage WebContainer instance.
 * Implements singleton pattern to prevent multiple boots.
 */
export function useWebContainer() {
    const [webcontainerInstance, setWebcontainerInstance] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const bootPromiseRef = useRef(null);

    useEffect(() => {
        async function boot() {
            // If already booted, just return the instance
            if (webcontainerInstance) return;

            // If already booting, wait for it
            if (bootPromiseRef.current) {
                try {
                    const instance = await bootPromiseRef.current;
                    setWebcontainerInstance(instance);
                    setIsLoading(false);
                } catch (err) {
                    setError(err);
                    setIsLoading(false);
                }
                return;
            }

            // Start booting
            try {
                setIsLoading(true);
                console.log('📦 Booting WebContainer...');

                bootPromiseRef.current = WebContainer.boot();
                const instance = await bootPromiseRef.current;

                console.log('✅ WebContainer booted successfully!');
                setWebcontainerInstance(instance);
                setIsLoading(false);
            } catch (err) {
                console.error('❌ Failed to boot WebContainer:', err);
                setError(err);
                setIsLoading(false);
                bootPromiseRef.current = null; // Reset promise on error so we can retry
            }
        }

        boot();
    }, []);

    return { webcontainerInstance, isLoading, error };
}
