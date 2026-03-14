import { useCallback } from 'react';
import { useLoadingStore, LoadingKey } from '../store/loadingStore';

export const useLoading = (key?: LoadingKey) => {
    const isLoadingValue = useLoadingStore(state => key ? (state.loadingStates[key] ?? false) : false);
    const setLoading = useLoadingStore(state => state.setLoading);
    const setMultipleLoading = useLoadingStore(state => state.setMultipleLoading);

    const startLoading = useCallback((customKey?: LoadingKey) => {
        const targetKey = customKey || key;
        if (targetKey) {
            setLoading(targetKey, true);
        }
    }, [key, setLoading]);

    const stopLoading = useCallback((customKey?: LoadingKey) => {
        const targetKey = customKey || key;
        if (targetKey) {
            setLoading(targetKey, false);
        }
    }, [key, setLoading]);

    const withLoading = useCallback(
        async <T,>(
            fn: () => Promise<T>,
            customKey?: LoadingKey
        ): Promise<T> => {
            const targetKey = customKey || key;
            if (!targetKey) {
                return fn();
            }

            try {
                setLoading(targetKey, true);
                const result = await fn();
                return result;
            } finally {
                setLoading(targetKey, false);
            }
        },
        [key, setLoading]
    );

    const checkLoading = useCallback((k: LoadingKey) => {
        return useLoadingStore.getState().loadingStates[k] ?? false;
    }, []);

    const checkAnyLoading = useCallback((...keys: LoadingKey[]) => {
        const states = useLoadingStore.getState().loadingStates;
        return keys.some(k => states[k]);
    }, []);

    return {
        isLoading: isLoadingValue,
        startLoading,
        stopLoading,
        withLoading,
        setLoading,
        setMultipleLoading,
        checkLoading,
        checkAnyLoading,
        allLoadingStates: useLoadingStore.getState().loadingStates,
    };
};
