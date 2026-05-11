import React, { useEffect, useState, useMemo } from 'react';
import { Cake, MessageCircle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { friendService } from '../../services/friendService';
import { User, Visibility } from '../../../shared/types';
import { isBirthdayToday } from '../../utils/dateUtils';
import { canViewField } from '../../utils/privacyUtils';
import { useRtdbChatStore } from '../../store/rtdbChatStore';
import { rtdbMessageService } from '../../services/chat/rtdbMessageService';
import { toast } from '../../store/toastStore';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';

const BIRTHDAY_WISHES = [
  "Chúc mừng sinh nhật! 🎂",
  "Tuổi mới rực rỡ nhé! ✨",
];

interface BirthdayRowProps {
  friend: User;
  onQuickWish: (friend: User, wish: string) => void;
  onOpenChat: (friend: User) => void;
}

const BirthdayRow: React.FC<BirthdayRowProps> = ({ friend, onQuickWish, onOpenChat }) => (
  <div className="p-4 flex items-center gap-3 hover:bg-bg-secondary/30 transition-colors">
    <Link to={`/profile/${friend.id}`} className="shrink-0">
      <Avatar src={friend.avatar?.url} name={friend.fullName} size="lg" />
    </Link>
    
    <div className="flex-grow min-w-0">
      <Link to={`/profile/${friend.id}`} className="text-sm font-bold text-text-primary hover:text-primary transition-colors truncate block">
        {friend.fullName}
      </Link>
      
      <div className="flex flex-wrap gap-1.5 mt-1">
        {BIRTHDAY_WISHES.map((wish, i) => (
          <button
            key={i}
            onClick={() => onQuickWish(friend, wish)}
            className="px-2.5 py-1 rounded-full bg-bg-secondary border border-border-light text-[10px] font-medium text-text-secondary hover:border-primary/40 hover:text-primary active:scale-95 transition-all"
          >
            {wish}
          </button>
        ))}
      </div>
    </div>

    <button 
      onClick={() => onOpenChat(friend)}
      className="p-2 text-text-tertiary hover:text-primary hover:bg-primary/5 rounded-full transition-all shrink-0"
      title="Vào Chat"
    >
      <MessageCircle size={20} strokeWidth={1.5} />
    </button>
  </div>
);

// Widget hiển thị và tương tác sinh nhật trên Feed
export const BirthdayWidget: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [friendsWithBirthday, setFriendsWithBirthday] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = friendService.subscribeToFriends(currentUser.id, (friends) => {
      const todayBirthdays = friends.filter(friend => {
        if (!isBirthdayToday(friend.dob)) return false;
        const dobVisibility = friend.profilePrivacy?.dob || Visibility.FRIENDS;
        return canViewField(dobVisibility, false, true);
      });
      setFriendsWithBirthday(todayBirthdays);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const isMyBirthday = useMemo(() => {
    return currentUser && isBirthdayToday(currentUser.dob);
  }, [currentUser]);

  if (!isMyBirthday && friendsWithBirthday.length === 0) {
    return null;
  }

  // Gửi lời chúc nhanh qua tin nhắn RTDB
  const handleQuickWish = async (friend: User, wish: string) => {
    if (!currentUser) return;
    try {
      const { getOrCreateConversation } = useRtdbChatStore.getState();
      const convId = getOrCreateConversation(currentUser.id, friend.id);
      
      await rtdbMessageService.sendTextMessage(convId, currentUser.id, wish);
      toast.success(`Đã gửi lời chúc đến ${friend.fullName}!`);
    } catch (error) {
      toast.error("Không thể gửi lời chúc lúc này.");
    }
  };

  // Mở hội thoại chat tương ứng
  const handleOpenChat = (friend: User) => {
    if (!currentUser) return;
    const { getOrCreateConversation } = useRtdbChatStore.getState();
    const convId = getOrCreateConversation(currentUser.id, friend.id);
    navigate(`/?conv=${convId}`);
  };
  const firstFriend = friendsWithBirthday[0];

  return (
    <>
      <div className="bg-bg-primary rounded-2xl border border-border-light mb-4 animate-fade-in shadow-sm overflow-hidden transition-all duration-300">
        <div className="flex items-center gap-3 p-3 sm:p-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
            <Cake size={20} strokeWidth={1.5} />
          </div>

          <div className="flex-grow min-w-0">
            {isMyBirthday ? (
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary">Hôm nay là sinh nhật của bạn!</h3>
                    <p className="text-[10px] text-text-secondary">Chúc bạn một ngày rực rỡ 🎂</p>
                  </div>
                </div>
                
                {friendsWithBirthday.length > 0 && (
                  <div 
                    className="mt-2 pt-2 border-t border-border-light/50 flex items-center justify-between cursor-pointer group"
                    onClick={() => setIsModalOpen(true)}
                  >
                    <p className="text-[10px] text-text-secondary truncate group-hover:text-primary transition-colors">
                      Hôm nay cũng là sinh nhật của {friendsWithBirthday.length === 1 ? firstFriend.fullName : `${firstFriend.fullName} và ${friendsWithBirthday.length - 1} người khác`}
                    </p>
                    <div className="flex items-center -space-x-1.5 ml-2">
                      {friendsWithBirthday.slice(0, 2).map((friend) => (
                        <Avatar key={friend.id} src={friend.avatar?.url} name={friend.fullName} size="xs" className="ring-1 ring-bg-primary" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : friendsWithBirthday.length === 1 ? (
              <div 
                className="flex items-center justify-between cursor-pointer group w-full"
                onClick={() => setIsModalOpen(true)}
              >
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-text-primary truncate group-hover:text-primary transition-colors">Sinh nhật bạn bè</h3>
                  <p className="text-[10px] text-text-secondary truncate mt-0.5">Hôm nay là sinh nhật của {firstFriend.fullName} 🎂</p>
                </div>
                <div className="flex items-center">
                  <Avatar src={firstFriend.avatar?.url} name={firstFriend.fullName} size="xs" className="ring-2 ring-bg-primary" />
                </div>
              </div>
            ) : (
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setIsModalOpen(true)}
              >
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors">Sinh nhật bạn bè</h3>
                  <p className="text-[10px] text-text-secondary truncate mt-0.5">
                    Hôm nay là sinh nhật của {firstFriend.fullName} và {friendsWithBirthday.length - 1} người khác 🎂
                  </p>
                </div>
                <div className="flex items-center -space-x-2">
                  {friendsWithBirthday.slice(0, 3).map((friend) => (
                    <Avatar key={friend.id} src={friend.avatar?.url} name={friend.fullName} size="xs" className="ring-2 ring-bg-primary" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Sinh nhật hôm nay"
        maxWidth="md"
        padding="none"
      >
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-border-light scroll-hide">
          {friendsWithBirthday.map((friend) => (
            <BirthdayRow 
              key={friend.id} 
              friend={friend} 
              onQuickWish={handleQuickWish} 
              onOpenChat={handleOpenChat} 
            />
          ))}
        </div>
      </Modal>
    </>
  );
};
