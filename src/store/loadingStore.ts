import { create } from 'zustand';

export type LoadingKey =
    | 'auth'
    | 'auth.login'
    | 'auth.register'
    | 'auth.logout'
    | 'auth.verification'
    | 'chat'
    | 'chat.messages'
    | 'chat.send'
    | 'chat.loadMore'
    | 'feed'
    | 'feed.posts'
    | 'feed.loadMore'
    | 'feed.create'
    | 'feed.update'
    | 'feed.delete'
    | 'post.detail'
    | 'contacts'
    | 'contacts.friends'
    | 'contacts.requests'
    | 'contacts.search'
    | 'profile'
    | 'profile.data'
    | 'profile.upload'
    | 'profile.update'
    | 'notifications'
    | 'settings'
    | 'admin.reports'
    | 'admin.users';

interface LoadingState {
    loadingStates: Record<LoadingKey, boolean>;
    setLoading: (key: LoadingKey, isLoading: boolean) => void;
    setMultipleLoading: (keys: LoadingKey[], isLoading: boolean) => void;
    isLoading: (key: LoadingKey) => boolean;
    isAnyLoading: (...keys: LoadingKey[]) => boolean;
    reset: () => void;
}

const initialLoadingStates: Record<LoadingKey, boolean> = {
    'auth': true,
    'auth.login': false,
    'auth.register': false,
    'auth.logout': false,
    'auth.verification': false,
    'chat': false,
    'chat.messages': false,
    'chat.send': false,
    'chat.loadMore': false,
    'feed': false,
    'feed.posts': false,
    'feed.loadMore': false,
    'feed.create': false,
    'feed.update': false,
    'feed.delete': false,
    'post.detail': false,
    'contacts': false,
    'contacts.friends': false,
    'contacts.requests': false,
    'contacts.search': false,
    'profile': false,
    'profile.data': false,
    'profile.upload': false,
    'profile.update': false,
    'notifications': false,
    'settings': false,
    'admin.reports': false,
    'admin.users': false,
};

export const useLoadingStore = create<LoadingState>((set, get) => ({
    loadingStates: { ...initialLoadingStates },

    setLoading: (key, isLoading) => {
        set((state) => ({
            loadingStates: {
                ...state.loadingStates,
                [key]: isLoading,
            },
        }));
    },

    setMultipleLoading: (keys, isLoading) => {
        set((state) => {
            const updates = keys.reduce((acc, key) => {
                acc[key] = isLoading;
                return acc;
            }, {} as Record<LoadingKey, boolean>);

            return {
                loadingStates: {
                    ...state.loadingStates,
                    ...updates,
                },
            };
        });
    },

    isLoading: (key) => {
        return get().loadingStates[key] || false;
    },

    isAnyLoading: (...keys) => {
        const { loadingStates } = get();
        return keys.some((key) => loadingStates[key]);
    },

    reset: () => {
        set({ loadingStates: { ...initialLoadingStates } });
    },
}));
