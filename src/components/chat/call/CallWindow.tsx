import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';
import { useUserCache } from '../../../store/userCacheStore';
import { useCallSounds } from '../../../hooks/chat/useCallSounds';
import { rtdbCallService } from '../../../services/chat/rtdbCallService';
import { useRtdbChatStore } from '../../../store';

interface CallWindowProps {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  callType: 'voice' | 'video';
  isGroupCall?: boolean;
  onClose: () => void;
}

export const CallWindow: React.FC<CallWindowProps> = ({
  roomId,
  userId,
  userName,
  userAvatar,
  callType,
  isGroupCall = false,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zegoRef = useRef<ZegoUIKitPrebuilt | null>(null);
  const onCloseRef = useRef(onClose);
  const { playSound } = useCallSounds();
  const updateCallMessage = useRtdbChatStore((s) => s.updateCallMessage);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const init = async () => {
      const getToken = httpsCallable<
        { roomId: string; userId: string; userName: string },
        { token: string }
      >(functions, 'generateZegoToken');

      const { data } = await getToken({ roomId, userId, userName });
      if (destroyed || !containerRef.current) return;

      const appId = Number(import.meta.env.VITE_ZEGO_APP_ID);
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
        appId,
        data.token,
        roomId,
        userId,
        userName,
      );

      const zp = ZegoUIKitPrebuilt.create(kitToken);
      zegoRef.current = zp;

      const activeParticipants = new Set<string>();

      zp.joinRoom({
        container: containerRef.current,
        scenario: {
          mode: isGroupCall
            ? ZegoUIKitPrebuilt.GroupCall
            : ZegoUIKitPrebuilt.OneONoneCall,
        },
        turnOnCameraWhenJoining: callType === 'video',
        showPreJoinView: false,
        showTextChat: false,
        showUserList: false,
        showLeavingView: false,
        console: ZegoUIKitPrebuilt.ConsoleNone,

        onUserAvatarSetter: (userList: any[]) => {
          const usersMap = useUserCache.getState().users;
          userList.forEach((u) => {
            if (!u.setUserAvatar) return;
            if (u.userID === userId && userAvatar) {
              u.setUserAvatar(userAvatar);
            } else {
              const cached = usersMap[u.userID];
              if (cached?.avatar?.url) u.setUserAvatar(cached.avatar.url);
            }
          });
        },

        onUserJoin: (users: any[]) => {
          users.forEach((u) => activeParticipants.add(u.userID));
          if (isGroupCall) playSound('action');
        },

        onUserLeave: (users: any[]) => {
          users.forEach((u) => activeParticipants.delete(u.userID));
          if (isGroupCall) {
            playSound('action');
            return;
          }
          if (activeParticipants.size === 0) {
            setTimeout(() => {
              destroyZego();
              onCloseRef.current();
            }, 500);
          }
        },

        onLeaveRoom: async () => {
          await rtdbCallService.updateCallParticipant(roomId, userId, false);

          const activeCall = await rtdbCallService.getActiveCall(roomId);
          if (activeCall?.messageId) {
            const remaining = activeCall.participants
              ? Object.keys(activeCall.participants).filter((id) => id !== userId)
              : [];

            if (remaining.length === 0) {
              const duration = Math.max(
                0,
                Math.floor((Date.now() - activeCall.startedAt) / 1000),
              );
              await updateCallMessage(roomId, activeCall.messageId, {
                callType,
                status: 'ended',
                duration,
              });
              await rtdbCallService.endActiveCall(roomId);
            }
          }

          destroyZego();
          onCloseRef.current();
        },
      });

      await rtdbCallService.updateCallParticipant(roomId, userId, true);
    };

    init().catch(console.error);

    return () => {
      destroyed = true;
      destroyZego();
    };
  }, [roomId, userId, userName, callType, isGroupCall]);

  function destroyZego() {
    if (zegoRef.current) {
      try {
        zegoRef.current.destroy();
      } catch {
      }
      zegoRef.current = null;
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        width: '100%',
        height: '100%',
        background: '#000',
      }}
    />
  );
};
