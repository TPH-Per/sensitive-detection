import React, { useCallback } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserAvatar, Skeleton } from '../ui';
import { User } from '../../../shared/types';
import { useAuthStore } from '../../store/authStore';
import { getHybridReason } from '../../utils/userUtils';

interface SuggestionItemProps {
    user: User;
    onAddFriend: (userId: string) => void;
    onDismiss: (userId: string) => void;
    isSending?: boolean;
    variant?: 'list' | 'card';
    className?: string;
}

const SuggestionItemInner: React.FC<SuggestionItemProps> = ({
    user,
    onAddFriend,
    onDismiss,
    isSending,
    variant = 'list',
    className,
}) => {
    const navigate = useNavigate();
    const currentUser = useAuthStore((state) => state.user);

    const getSmartReason = () => {
        return getHybridReason(currentUser, user);
    };

    const handleAdd = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onAddFriend(user.id);
        },
        [onAddFriend, user.id]
    );

    const handleDismiss = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onDismiss(user.id);
        },
        [onDismiss, user.id]
    );

    if (variant === 'card') {
        return (
            <div className={`relative flex flex-col items-center p-4 border border-border-light rounded-xl bg-bg-secondary flex-shrink-0 snap-start group shadow-sm hover:shadow-md transition-shadow ${className || 'w-[160px] min-w-[160px]'}`}>
                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-bg-primary/50 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
                    aria-label="Bỏ qua gợi ý"
                >
                    <X size={14} />
                </button>
                <button
                    className="flex flex-col items-center w-full mt-2"
                    onClick={() => navigate(`/profile/${user.id}`)}
                >
                    <UserAvatar 
                        userId={user.id} 
                        name={user.fullName} 
                        src={user.avatar?.url} 
                        size="xl" 
                    />
                    <p className="mt-3 text-sm font-semibold text-text-primary text-center truncate w-full">{user.fullName}</p>
                    <p className="text-[11px] text-text-tertiary text-center line-clamp-2 h-8 leading-4 mt-0.5">{getSmartReason()}</p>
                </button>
                <button
                    onClick={handleAdd}
                    disabled={isSending}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 active:bg-primary/30 transition-colors duration-200 disabled:opacity-50"
                >
                    <UserPlus size={14} />
                    Kết bạn
                </button>
            </div>
        );
    }

    return (
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border-light/60 last:border-0 hover:bg-bg-hover active:bg-bg-active transition-colors duration-200 group">
            <button
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                onClick={() => navigate(`/profile/${user.id}`)}
            >
                <UserAvatar 
                    userId={user.id} 
                    name={user.fullName} 
                    src={user.avatar?.url} 
                    size="md" 
                />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{user.fullName}</p>
                    <p className="text-xs text-text-tertiary truncate">{getSmartReason()}</p>
                </div>
            </button>

            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <button
                    onClick={handleAdd}
                    disabled={isSending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 active:bg-primary/30 transition-colors duration-200 disabled:opacity-50"
                >
                    <UserPlus size={13} />
                    Kết bạn
                </button>
                <button
                    onClick={handleDismiss}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors duration-200"
                    aria-label="Bỏ qua gợi ý"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};

const SuggestionItemSkeleton: React.FC<{ variant?: 'list' | 'card', className?: string }> = ({ variant = 'list', className }) => {
    if (variant === 'card') {
        return (
            <div className={`flex flex-col items-center p-4 border border-border-light rounded-xl bg-bg-secondary flex-shrink-0 snap-start space-y-3 shadow-sm ${className || 'w-[160px] min-w-[160px]'}`}>
                <Skeleton variant="circle" width={64} height={64} className="mt-2" />
                <Skeleton variant="line" width={100} height={14} />
                <Skeleton variant="line" width={80} height={10} className="mb-2" />
                <Skeleton variant="rect" width="100%" height={32} className="rounded-lg mt-1" />
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light/60 last:border-0">
            <div className="flex items-center gap-3 flex-1">
                <Skeleton variant="circle" width={40} height={40} />
                <div className="space-y-1.5">
                    <Skeleton variant="line" width={130} height={13} />
                    <Skeleton variant="line" width={80} height={11} className="opacity-60" />
                </div>
            </div>
            <div className="flex gap-1.5">
                <Skeleton variant="rect" width={72} height={30} className="rounded-lg" />
                <Skeleton variant="rect" width={28} height={28} className="rounded-lg opacity-40" />
            </div>
        </div>
    );
};

export const SuggestionItem = Object.assign(
    React.memo(SuggestionItemInner),
    { Skeleton: React.memo(SuggestionItemSkeleton) }
) as React.FC<SuggestionItemProps> & { Skeleton: React.FC<{ variant?: 'list' | 'card', className?: string }> };
