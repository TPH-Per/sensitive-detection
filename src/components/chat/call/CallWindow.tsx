import React, { useEffect, useRef } from "react";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../firebase/config";
import { useUserCache } from "../../../store/userCacheStore";
import { useCallSounds } from "../../../hooks/chat/useCallSounds";
import { rtdbCallService } from "../../../services/chat/rtdbCallService";
import { useRtdbChatStore } from "../../../store";

const ZEGO_APP_ID = Number(import.meta.env.VITE_ZEGO_APP_ID);

interface CallWindowProps {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  callType: "voice" | "video";
  isGroupCall?: boolean;
  onClose: () => void;
}

export const CallWindow: React.FC<CallWindowProps> = ({
  roomId,
  userId,
  userName,
  userAvatar,
  callType,
  isGroupCall,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zegoRef = useRef<ZegoUIKitPrebuilt | null>(null);
  const onCloseRef = useRef(onClose);
  const { playSound } = useCallSounds();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const init = async () => {
      const getToken = httpsCallable<
        { roomId: string; userId: string; userName: string },
        { token: string }
      >(functions, 'generateZegoToken');

      const { data } = await getToken({ roomId, userId, userName });
      if (cancelled || !containerRef.current) return;

      const zp = ZegoUIKitPrebuilt.create(data.token);
      zegoRef.current = zp;

      const activeUsers = new Set<string>();

      zp.joinRoom({
        container: containerRef.current,
        scenario: {
          mode: isGroupCall ? ZegoUIKitPrebuilt.GroupCall : ZegoUIKitPrebuilt.OneONoneCall,
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
            if (u.userID === userId && userAvatar && u.setUserAvatar) {
              u.setUserAvatar(userAvatar);
            } else if (u.setUserAvatar) {
              const cachedUser = usersMap[u.userID];
              if (cachedUser?.avatar) u.setUserAvatar(cachedUser.avatar);
            }
          });
        },
        onLeaveRoom: () => {
          rtdbCallService.updateCallParticipant(roomId, userId, false).then(async () => {
             const activeCall = await rtdbCallService.getActiveCall(roomId);
             if (!activeCall || !activeCall.participants || Object.keys(activeCall.participants).length === 0) {
               if (activeCall && activeCall.messageId) {
                 const duration = Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000));
                 const { updateCallMessage } = useRtdbChatStore.getState();
                 await updateCallMessage(roomId, activeCall.messageId, { 
                   callType, 
                   status: 'ended', 
                   duration 
                 });
                 await rtdbCallService.endActiveCall(roomId);
               }
             }
          });

          zegoRef.current = null;
          onCloseRef.current();
        },
        onUserJoin: (users: any[]) => {
          users.forEach((u) => activeUsers.add(u.userID));
          if (isGroupCall) playSound('action');
        },
        onUserLeave: (users: any[]) => {
          users.forEach((u) => activeUsers.delete(u.userID));
          if (isGroupCall) playSound('action');

          if (!isGroupCall && activeUsers.size === 0) {
              setTimeout(() => {
                if (zegoRef.current) {
                  try { zegoRef.current.destroy(); } catch (e) { console.error(e); }
                  zegoRef.current = null;
                }
                onCloseRef.current();
              }, 500);
          }
        },
      });

      await rtdbCallService.updateCallParticipant(roomId, userId, true);
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      if (zegoRef.current) {
        try { zegoRef.current.destroy(); } catch (e) { console.error(e); }
        zegoRef.current = null;
      }
    };
  }, [roomId, userId, userName, callType]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        width: "100%",
        height: "100%",
        background: "#000",
      }}
    />
  );
};
