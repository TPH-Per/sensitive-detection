import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';
import { useUserCache } from '../../../store/userCacheStore';

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
  roomId, userId, userName, userAvatar, callType, isGroupCall = false, onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zegoRef = useRef<ZegoUIKitPrebuilt | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const destroyZego = () => {
      if (zegoRef.current) {
        try { zegoRef.current.destroy(); } catch { /* ignored */ }
        zegoRef.current = null;
      }
    };

    const init = async () => {
      if (!roomId || !userId || !userName) return;

      const getToken = httpsCallable<
        { roomId: string; userId: string; userName: string },
        { token: string }
      >(functions, 'generateZegoToken');

      try {
        const { data } = await getToken({ roomId, userId, userName });
        if (destroyed || !containerRef.current) return;

        const appId = Number(import.meta.env.VITE_ZEGO_APP_ID);
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(appId, data.token, roomId, userId, userName);
        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zegoRef.current = zp;

        const activeParticipants = new Set<string>();

        zp.joinRoom({
          container: containerRef.current,
          scenario: { mode: isGroupCall ? ZegoUIKitPrebuilt.GroupCall : ZegoUIKitPrebuilt.OneONoneCall },
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
              if (u.userID === userId && userAvatar) u.setUserAvatar(userAvatar);
              else {
                const cached = usersMap[u.userID];
                if (cached?.avatar?.url) u.setUserAvatar(cached.avatar.url);
              }
            });
          },

          onUserJoin: (users: any[]) => { users.forEach(u => activeParticipants.add(u.userID)); },

          onUserLeave: (users: any[]) => {
            users.forEach(u => activeParticipants.delete(u.userID));
            if (activeParticipants.size === 0) {
              setTimeout(() => { destroyZego(); onCloseRef.current(); }, 500);
            }
          },

          onLeaveRoom: async () => { destroyZego(); onCloseRef.current(); },
        });
      } catch {
        onCloseRef.current();
      }
    };

    init();

    return () => { destroyed = true; destroyZego(); };
  }, [roomId, userId, userName, callType, isGroupCall]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-toast)', width: '100%', height: '100%', background: '#000' }}
    />
  );
};
