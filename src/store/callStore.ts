import { create } from 'zustand';
import { RtdbCallSignaling } from '../../shared/types';

export type CallPhase = 'idle' | 'outgoing' | 'in-call';

type SignalingActions = {
  startCall: (
    recipientIds: string[],
    callerId: string,
    callerName: string,
    callerAvatar: string,
    callType: 'voice' | 'video',
    conversationId: string,
    isGroupCall?: boolean,
  ) => Promise<{ success: boolean; reason?: string }>;
  acceptCall: (signal: RtdbCallSignaling) => Promise<void>;
  rejectCall: (signal: RtdbCallSignaling) => Promise<void>;
  endCall: (otherUserIds?: string[]) => Promise<void>;
};

interface CallState extends SignalingActions {
  callPhase: CallPhase;
  callType: 'voice' | 'video';
  activeRoomId: string | null;
  otherUserIds: string[];
  isGroupCall: boolean;
  isCaller: boolean;
  callStartTime: number | null;
  callConversationId: string | null;

  setCallPhase: (phase: CallPhase) => void;
  setCallType: (type: 'voice' | 'video') => void;
  setActiveRoomId: (id: string | null) => void;
  setOtherUserIds: (ids: string[]) => void;
  setIsGroupCall: (v: boolean) => void;
  setIsCaller: (v: boolean) => void;
  setCallStartTime: (t: number | null) => void;
  setCallConversationId: (id: string | null) => void;
  setSignalingActions: (actions: SignalingActions) => void;
  resetCall: () => void;
}

const noopAsync = async () => { };

const initialState = {
  callPhase: 'idle' as CallPhase,
  callType: 'voice' as 'voice' | 'video',
  activeRoomId: null,
  otherUserIds: [] as string[],
  isGroupCall: false,
  isCaller: false,
  callStartTime: null,
  callConversationId: null,
  startCall: noopAsync as any,
  acceptCall: noopAsync as any,
  rejectCall: noopAsync as any,
  endCall: noopAsync as any,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  setCallPhase: (callPhase) => set({ callPhase }),
  setCallType: (callType) => set({ callType }),
  setActiveRoomId: (activeRoomId) => set({ activeRoomId }),
  setOtherUserIds: (otherUserIds) => set({ otherUserIds }),
  setIsGroupCall: (isGroupCall) => set({ isGroupCall }),
  setIsCaller: (isCaller) => set({ isCaller }),
  setCallStartTime: (callStartTime) => set({ callStartTime }),
  setCallConversationId: (callConversationId) => set({ callConversationId }),

  setSignalingActions: (actions) => set(actions),

  resetCall: () =>
    set((state) => ({
      ...initialState,
      startCall: state.startCall,
      acceptCall: state.acceptCall,
      rejectCall: state.rejectCall,
      endCall: state.endCall,
    })),
}));
