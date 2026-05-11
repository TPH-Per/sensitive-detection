import React from 'react';
import { Users, ShieldCheck, Clock } from 'lucide-react';
import { MediaObject } from '../../../../shared/types';
import { Modal, Button, Avatar } from '../../ui';

interface JoinGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: () => void;
  isLoading?: boolean;
  groupInfo: {
    name: string;
    avatar?: MediaObject;
    members?: any[];
    memberCount: number;
    isMember?: boolean;
    isPending?: boolean;
    joinApprovalMode?: boolean;
  } | null;
}

/**
 * Modal hiển thị thông tin chi tiết của nhóm trước khi người dùng xác nhận tham gia
 */
export const JoinGroupModal: React.FC<JoinGroupModalProps> = ({
  isOpen, onClose, onJoin, isLoading, groupInfo
}) => {
  if (!groupInfo) return null;

  const { name, avatar, members, memberCount, isMember, isPending, joinApprovalMode } = groupInfo;

  const renderFooter = (
    <div className="flex gap-3 w-full">
      <Button variant="secondary" onClick={onClose} className="flex-1">
        Bỏ qua
      </Button>
      {!isMember && !isPending && (
        <Button onClick={onJoin} isLoading={isLoading} className="flex-1">
          {joinApprovalMode ? 'Gửi yêu cầu' : 'Tham gia ngay'}
        </Button>
      )}
      {isMember && (
        <Button onClick={onJoin} className="flex-1">
          Vào trò chuyện
        </Button>
      )}
      {isPending && (
        <Button disabled className="flex-1 bg-bg-tertiary text-text-tertiary border-none">
          Đang chờ duyệt
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tham gia nhóm"
      maxWidth="sm"
      footer={renderFooter}
    >
      <div className="flex flex-col items-center py-4 space-y-6">
        {/* Group Avatar */}
          <Avatar
            src={avatar}
            name={name}
            size="xl"
            isGroup={true}
            members={members}
            className="relative z-10"
          />

        {/* Group Info */}
        <div className="text-center space-y-2 relative z-10 w-full px-2">
          <h2 className="text-xl font-bold text-text-primary line-clamp-2">
            {name}
          </h2>
          
          <div className="flex items-center justify-center gap-4 text-sm text-text-secondary">
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-primary" />
              <span>{memberCount} thành viên</span>
            </div>
            
            {joinApprovalMode ? (
              <div className="flex items-center gap-1.5 text-amber-500">
                <Clock size={14} />
                <span>Cần duyệt</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-green-500">
                <ShieldCheck size={14} />
                <span>Tham gia ngay</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Badge */}
        {isMember && (
          <div className="px-3 py-1 bg-green-500/10 text-green-500 text-xs font-semibold rounded-full border border-green-500/20">
            Bạn đã là thành viên
          </div>
        )}
        {isPending && (
          <div className="px-3 py-1 bg-amber-500/10 text-amber-500 text-xs font-semibold rounded-full border border-amber-500/20">
            Yêu cầu đang chờ phê duyệt
          </div>
        )}

        {/* Description/Note */}
        {!isMember && !isPending && (
          <p className="text-xs text-text-tertiary text-center leading-relaxed max-w-[280px]">
            {joinApprovalMode 
              ? "Yêu cầu tham gia của bạn sẽ được Quản trị viên xem xét trước khi vào nhóm."
              : "Bạn có thể bắt đầu trò chuyện ngay sau khi nhấn nút tham gia."
            }
          </p>
        )}
      </div>
    </Modal>
  );
};
