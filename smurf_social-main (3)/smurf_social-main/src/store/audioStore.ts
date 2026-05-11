import { create } from 'zustand';

interface AudioState {
    currentlyPlayingId: string | null;
    isPlaying: boolean;
    setCurrentlyPlaying: (id: string | null) => void;
    setIsPlaying: (isPlaying: boolean) => void;
    togglePlay: (id: string) => void;
    stopAll: () => void;
}

export const useAudioStore = create<AudioState>((set) => ({
    currentlyPlayingId: null,
    isPlaying: false,

    /** Thiết lập ID âm thanh đang phát */
    setCurrentlyPlaying: (id) => set({ currentlyPlayingId: id }),
    /** Cập nhật trạng thái phát */
    setIsPlaying: (isPlaying) => set({ isPlaying }),

    /** Chuyển đổi trạng thái phát */
    togglePlay: (id) => set((state) => {
        if (state.currentlyPlayingId === id) {
            return { isPlaying: !state.isPlaying };
        }
        return { currentlyPlayingId: id, isPlaying: true };
    }),

    /** Dừng tất cả âm thanh */
    stopAll: () => set({ currentlyPlayingId: null, isPlaying: false }),
}));
