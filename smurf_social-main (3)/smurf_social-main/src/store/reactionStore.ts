import { create } from 'zustand';
import { ReactionType } from '../../shared/types';

interface ReactionState {
    optimisticReactions: Record<string, ReactionType | null>;
    setOptimisticReaction: (sourceId: string, reaction: ReactionType | null) => void;
    clearOptimisticReaction: (sourceId: string) => void;
    reset: () => void;
}

export const useReactionStore = create<ReactionState>((set) => ({
    optimisticReactions: {},

    /** Thiết lập phản hồi lạc quan */
    setOptimisticReaction: (sourceId: string, reaction: ReactionType | null) => {
        set((state) => ({
            optimisticReactions: {
                ...state.optimisticReactions,
                [sourceId]: reaction
            }
        }));
    },

    /** Xóa phản hồi lạc quan */
    clearOptimisticReaction: (sourceId: string) => {
        set((state) => {
            const { [sourceId]: _, ...rest } = state.optimisticReactions;
            return { optimisticReactions: rest };
        });
    },

    /** Đặt lại trạng thái phản hồi */
    reset: () => {
        set({ optimisticReactions: {} });
    }
}));
