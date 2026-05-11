import React, { useEffect, useState, useMemo } from 'react';
import { Modal, UserAvatar, Skeleton } from './index';
import { User, ReactionType } from '../../../shared/types';
import { batchGetUsers } from '../../utils/batchUtils';
import { getReactionIcon } from '../chat/reactions/ReactionIcons';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface ReactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions?: Record<string, string | ReactionType>;
  sourceId?: string;
  sourceType?: 'post' | 'comment' | 'message';
  currentUserId: string;
}

export const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({
  isOpen,
  onClose,
  reactions: reactionsProp,
  sourceId,
  sourceType,
  currentUserId,
}) => {
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | ReactionType>('ALL');
  // Map {userId: reactionType} — cho cả 2 mode
  const [reactions, setReactions] = useState<Record<string, string | ReactionType>>(reactionsProp ?? {});

  // Tải từ subcollection khi POST/COMMENT context
  useEffect(() => {
    if (!isOpen) return;

    // Ưu tiên sử dụng reactions từ prop (Chat hoặc khi Ref cho Posts/Comments đã có sẵn)
    if (reactionsProp) {
      setReactions(reactionsProp);
      return;
    }

    // Chỉ truy vấn Firestore nếu là Post/Comment và có sourceId
    if (sourceId && sourceType && (sourceType === 'post' || sourceType === 'comment')) {
      const colPath = sourceType === 'post'
        ? `posts/${sourceId}/reactions`
        : `comments/${sourceId}/reactions`;

      getDocs(collection(db, colPath))
        .then(snap => {
          const map: Record<string, string> = {};
          snap.forEach(d => { map[d.id] = d.data().type; });
          setReactions(map);
        })
        .catch((err) => {
          console.error(`Lỗi tải Firestore reactions cho ${sourceType}:`, err);
          setReactions({});
        });
    }
  }, [isOpen, sourceId, sourceType, reactionsProp]);

  const reactionEntries = useMemo(() => Object.entries(reactions), [reactions]);

  const reactionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    reactionEntries.forEach(([, type]) => {
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [reactionEntries]);

  const tabs = useMemo(() => {
    const availableTypes = Object.keys(reactionCounts) as ReactionType[];
    return ['ALL', ...availableTypes];
  }, [reactionCounts]);

  useEffect(() => {
    if (!isOpen || reactionEntries.length === 0) return;

    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const userIds = reactionEntries.map(([userId]) => userId);
        const fetchedUsers = await batchGetUsers(userIds);
        setUsersMap(fetchedUsers);
      } catch (error) {
        console.error('Lỗi tải người dùng reaction:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [isOpen, reactionEntries]);

  const displayList = useMemo(() => {
    const list = reactionEntries
      .map(([userId, type]) => ({
        user: usersMap[userId],
        type: type as ReactionType,
        userId
      }))
      .filter(item => !!item.user);

    return list.filter(item => activeTab === 'ALL' || item.type === activeTab);
  }, [usersMap, reactionEntries, activeTab]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cảm xúc"
      maxWidth="sm"
      bodyClassName="!p-0"
    >
      <div className="flex flex-col h-[500px] max-h-[70vh]">
        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-4 px-4 border-b border-divider overflow-x-auto scroll-hide">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as 'ALL' | ReactionType)}
                className={`py-3 px-1 border-b-2 transition-all duration-200 text-sm font-semibold whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
              >
                {tab === 'ALL' ? (
                  'Tất cả'
                ) : (
                  <>
                    {getReactionIcon(tab as ReactionType, "", 16)}
                    <span>{reactionCounts[tab]}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-hide p-2">
          {isLoading ? (
            <div className="space-y-4 p-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton variant="circle" width={40} height={40} />
                  <Skeleton variant="line" width={150} height={16} />
                </div>
              ))}
            </div>
          ) : (displayList.length > 0) ? (
            <div className={`flex flex-col h-full ${displayList.length === 0 ? 'items-center justify-center p-10' : 'p-2'}`}>
              {displayList.length > 0 && (
                <div className="space-y-1 w-full">
                  {displayList.map(({ user, type, userId }) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-hover rounded-xl transition-colors duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <UserAvatar
                            userId={userId}
                            src={user.avatar?.url}
                            name={user.fullName}
                            size="md"
                            showStatus={false}
                          />
                          <div className="absolute -bottom-1 -right-1 bg-bg-primary rounded-full p-0.5 shadow-sm border border-border-light">
                            {getReactionIcon(type, "", 14)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors duration-200">
                            {userId === currentUserId ? 'Bạn' : user.fullName}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-text-tertiary p-10">
              <p className="italic text-sm">Chưa có ai bày tỏ cảm xúc này</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
