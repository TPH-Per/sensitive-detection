import React from 'react';
import { MoreVertical, Reply, Forward, RotateCcw, Edit2, Trash2 } from 'lucide-react';
import { RtdbMessage, MessageType } from '../../../../shared/types';
import { IconButton, Dropdown, DropdownItem } from '../../ui';

interface MessageActionsProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  canEdit: boolean;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  setShowRecallConfirm: (show: boolean) => void;
  onDeleteForMe?: (messageId: string) => void;
  isBlocked: boolean;
  isPartnerBanned?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message, isMe, canEdit, showMenu, setShowMenu,
  onReply, onForward, onEdit, setShowRecallConfirm,
  onDeleteForMe, isBlocked, isPartnerBanned = false,
}) => {
  const isInteractionDisabled = isBlocked || isPartnerBanned;

  return (
    <div
      className={`
        absolute top-0 transition-opacity duration-200 flex items-center gap-0.5
        ${showMenu ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 [@media(hover:none)]:opacity-100'}
        ${isMe ? 'right-full mr-1.5' : 'left-full ml-1.5'}
      `}
    >
      {!isInteractionDisabled && message.data.type !== MessageType.CALL && (
        <IconButton
          icon={<Reply size={14} />}
          size="sm"
          title="Trả lời"
          onClick={() => onReply?.(message)}
          className="hover:text-primary transition-all duration-200"
        />
      )}

      <Dropdown
        isOpen={showMenu}
        onOpenChange={setShowMenu}
        align={isMe ? 'right' : 'left'}
        trigger={
          <IconButton
            icon={<MoreVertical size={14} />}
            size="sm"
            className={showMenu ? 'opacity-100' : ''}
          />
        }
      >
        {message.data.type !== 'call' && (
          <>
            <DropdownItem
              icon={<Forward size={14} />}
              label="Chuyển tiếp"
              onClick={() => { onForward?.(message); setShowMenu(false); }}
            />
            {!isInteractionDisabled && canEdit && (
              <DropdownItem
                icon={<Edit2 size={14} />}
                label="Chỉnh sửa"
                onClick={() => { onEdit?.(message); setShowMenu(false); }}
              />
            )}
            {!isInteractionDisabled && isMe && (
              <DropdownItem
                icon={<RotateCcw size={14} className="text-warning" />}
                label="Thu hồi"
                className="!text-warning hover:!text-warning"
                onClick={() => { setShowRecallConfirm(true); setShowMenu(false); }}
              />
            )}
          </>
        )}
        {!isInteractionDisabled && (
          <DropdownItem
            icon={<Trash2 size={14} />}
            label="Xóa phía tôi"
            variant="danger"
            onClick={() => { onDeleteForMe?.(message.id); setShowMenu(false); }}
          />
        )}
      </Dropdown>
    </div>
  );
};
