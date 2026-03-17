import { create } from 'zustand';
import { RtdbCallSignaling } from '../../shared/types';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'in-call';

interface CallSession {
  conversationId: string;
  callType: 'voice' | 'video';
  isGroupCall: boolean;
  participants: string[];
  startTime?: number;
  roomId?: string;
  isCaller: boolean;
  calleeName?: string;
  calleeAvatar?: string;
}

interface CallState {
  // Trạng thái chính
  phase: CallPhase;
  
  // Thông tin phiên hiện tại
  session: CallSession | null;
  
  // Tín hiệu cuộc gọi đến đang chờ xử lý
  incomingSignal: RtdbCallSignaling | null;

  // Actions
  setPhase: (phase: CallPhase) => void;
  setSession: (session: CallSession | null) => void;
  setIncomingSignal: (signal: RtdbCallSignaling | null) => void;
  resetCall: () => void;
}

const initialState = {
  phase: 'idle' as CallPhase,
  session: null as CallSession | null,
  incomingSignal: null as RtdbCallSignaling | null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setSession: (session) => set({ session }),
  setIncomingSignal: (incomingSignal) => set({ incomingSignal }),

  resetCall: () => set(initialState),
}));
