import React, { useEffect, useMemo } from 'react';
import { getInitials, getAvatarGradient } from '../../utils';
import { User, MediaObject } from '../../../shared/types';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/authStore';
import { useContactStore } from '../../store/contactStore';
import { useUserCache } from '../../store/userCacheStore';


export interface AvatarProps {
    src?: string | MediaObject;
    name?: string;
    size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    status?: 'active' | 'banned';
    className?: string;
    isGroup?: boolean;
    members?: User[];
    showBorder?: boolean;
    onClick?: () => void;
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
    '2xs': 'w-[14px] h-[14px] text-[7px]',
    xs: 'w-6 h-6 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-24 h-24 text-xl',
    '2xl': 'w-32 h-32 text-2xl',
};

const statusColor: Record<NonNullable<AvatarProps['status']>, string> = {
    active: 'bg-status-online border-bg-primary',
    banned: 'bg-status-offline border-bg-primary',
};

const groupPositions: Record<number, string[]> = {
    1: ['w-full h-full'],
    2: ['w-[62%] h-[62%] top-0 left-0 z-10', 'w-[62%] h-[62%] bottom-0 right-0'],
    3: [
        'w-[56%] h-[56%] top-0 left-1/2 -translate-x-1/2 z-10',
        'w-[56%] h-[56%] bottom-0 left-0',
        'w-[56%] h-[56%] bottom-0 right-0 z-20',
    ],
    4: [
        'w-[54%] h-[54%] top-0 left-0 z-10',
        'w-[54%] h-[54%] top-0 right-0',
        'w-[54%] h-[54%] bottom-0 left-0 z-20',
        'w-[54%] h-[54%] bottom-0 right-0 z-30',
    ],
};

const MemberTile: React.FC<{ member: User; isOverflow: boolean; overflowCount: number }> = ({
    member, isOverflow, overflowCount,
}) => {
    if (isOverflow) {
        return (
            <div aria-hidden="true" className="w-full h-full flex items-center justify-center bg-bg-hover text-[8px] font-bold text-text-primary">
                +{overflowCount}
            </div>
        );
    }
    if (member.avatar?.url) {
        return (
            <img
                src={member.avatar.url}
                alt=""
                className={`w-full h-full object-cover ${member.avatar.isSensitive ? 'blur-sm' : ''}`}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
        );
    }
    return (
        <div
            aria-hidden="true"
            className="w-full h-full flex items-center justify-center text-[8px] font-bold text-text-on-primary uppercase"
            style={{ background: getAvatarGradient(member.fullName || member.id) }}
        >
            {getInitials(member.fullName).substring(0, 1)}
        </div>
    );
};

const AvatarInner: React.FC<AvatarProps> = ({
    src, name, size = 'md', status, className = '',
    isGroup, members = [], showBorder = true, onClick,
}) => {
    const avatarUrl = typeof src === 'string' ? src : src?.url;
    const isSensitive = typeof src === 'object' && src?.isSensitive;
    const isCompositeGrid = isGroup && members.length > 0 && (!avatarUrl || avatarUrl === '/blank-avatar.png');

    const renderContent = () => {
        if (avatarUrl && avatarUrl !== '/blank-avatar.png') {
            return (
                <img
                    className={`w-full h-full object-cover transition-opacity duration-200 ${isSensitive ? 'blur-md' : ''}`}
                    src={avatarUrl}
                    alt={name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            );
        }

        if (isCompositeGrid) {
            const displayMembers = members.slice(0, 4);
            const count = Math.min(displayMembers.length, 4) as 1 | 2 | 3 | 4;
            const positions = groupPositions[count] ?? groupPositions[4];

            return (
                <div className="relative w-full h-full bg-transparent">
                    {displayMembers.map((member, idx) => (
                        <div
                            key={member.id || idx}
                            className={`absolute rounded-full overflow-hidden border-2 border-bg-primary bg-bg-secondary flex items-center justify-center ${positions[idx]}`}
                        >
                            <MemberTile
                                member={member}
                                isOverflow={idx === 3 && members.length > 4}
                                overflowCount={members.length - 3}
                            />
                        </div>
                    ))}
                </div>
            );
        }

        return (
            <div
                className="w-full h-full flex items-center justify-center font-bold text-text-on-primary uppercase leading-none"
                style={{ background: getAvatarGradient(name || '?') }}
            >
                {getInitials(name || '?')}
            </div>
        );
    };

    return (
        <div
            className={`relative inline-flex flex-shrink-0 ${sizeClasses[size]} rounded-full ${className} ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity duration-200' : ''}`}
            onClick={onClick}
        >
            <div className={`
        w-full h-full relative rounded-full flex items-center justify-center
        ${!isCompositeGrid ? 'overflow-hidden' : ''}
        ${!isGroup ? 'bg-bg-secondary' : 'bg-transparent'}
        ${size !== '2xs' && !isGroup && showBorder ? 'border border-border-light' : ''}
      `}>
                {renderContent()}
            </div>
            {status && (
                <span
                    className={`absolute bottom-0 right-0 block h-[30%] w-[30%] rounded-full border-2 ${statusColor[status]} z-10`}
                />
            )}
        </div>
    );
};

export const Avatar = React.memo(AvatarInner);

interface UserAvatarProps extends Omit<AvatarProps, 'status'> {
    userId: string;
    initialStatus?: 'active' | 'banned';
    showStatus?: boolean;
}

const UserAvatarInner: React.FC<UserAvatarProps> = ({
    userId, src, name, size, className, isGroup,
    members, initialStatus, showStatus = true, showBorder = true, onClick
}) => {
    const presence = usePresence(isGroup ? undefined : userId, initialStatus);
    const currentUser = useAuthStore(state => state.user);
    const isFriend = useContactStore(state => state.friends.some(f => f.id === userId));

    const cachedUser = useUserCache(state => userId ? state.users[userId] : undefined);
    const fetchUsers = useUserCache(state => state.fetchUsers);

    useEffect(() => {
        if (userId && !name && !cachedUser) {
            fetchUsers([userId]);
        }
    }, [userId, name, cachedUser, fetchUsers]);

    const displayName = name || cachedUser?.fullName;
    const cachedAvatarUrl = userId === currentUser?.id ? currentUser?.avatar?.url : cachedUser?.avatar?.url;
    const avatarUrl = cachedAvatarUrl || (typeof src === 'string' ? src : src?.url);

    const statusToDisplay = useMemo((): 'active' | 'banned' | undefined => {
        if (!showStatus) return undefined;
        const effectiveStatus = cachedUser?.status ?? initialStatus;
        if (effectiveStatus === 'banned') return undefined;
        if (userId === currentUser?.id) return presence && 'isOnline' in presence && presence.isOnline ? 'active' : undefined;
        return (isFriend && presence && 'isOnline' in presence && presence.isOnline) ? 'active' : undefined;
    }, [presence, showStatus, userId, currentUser?.id, isFriend, initialStatus, cachedUser?.status]);

    return (
        <Avatar
            src={avatarUrl}
            name={displayName}
            size={size}
            status={statusToDisplay}
            className={className}
            isGroup={isGroup}
            members={members}
            showBorder={showBorder}
            onClick={onClick}
        />
    );
};

export const UserAvatar = React.memo(UserAvatarInner);
