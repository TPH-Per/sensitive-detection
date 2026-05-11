import { create } from 'zustand';
import { RtdbCallSignaling } from '../../shared/types';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'in-call';
export type CallEndReason = 'rejected' | 'busy' | null;

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
  phase: CallPhase;
  session: CallSession | null;
  incomingSignal: RtdbCallSignaling | null;
  callEndReason: CallEndReason;

  setPhase: (phase: CallPhase) => void;
  setSession: (session: CallSession | null) => void;
  setIncomingSignal: (signal: RtdbCallSignaling | null) => void;
  setCallEndReason: (reason: CallEndReason) => void;
  resetCall: () => void;
  reset: () => void;
}

const initialState = {
  phase: 'idle' as CallPhase,
  session: null as CallSession | null,
  incomingSignal: null as RtdbCallSignaling | null,
  callEndReason: null as CallEndReason,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  /** Cập nhật giai đoạn cuộc gọi */
  setPhase: (phase) => set({ phase }),
  /** Thiết lập phiên cuộc gọi */
  setSession: (session) => set({ session }),
  /** Lưu tín hiệu cuộc gọi đến */
  setIncomingSignal: (incomingSignal) => set({ incomingSignal }),
  /** Thiết lập lý do kết thúc */
  setCallEndReason: (callEndReason) => set({ callEndReason }),

  /** Đặt lại cuộc gọi */
  resetCall: () => set(initialState),
  /** Đặt lại toàn bộ trạng thái */
  reset: () => set(initialState),
}));
import { registerStore } from './storeUtils';
registerStore(() => useCallStore.getState().reset());
