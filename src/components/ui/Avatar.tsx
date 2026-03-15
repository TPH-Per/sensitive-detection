import React from 'react';
import { getInitials, getAvatarGradient } from '../../utils';
import { User, MediaObject } from '../../../shared/types';

interface AvatarProps {
  src?: string | MediaObject;
  name?: string;
  size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: 'active' | 'banned';
  className?: string;
  isGroup?: boolean;
  members?: User[];
  onClick?: () => void;
}

const sizeClasses = {
  '2xs': 'w-[14px] h-[14px] text-[7px]',
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-24 h-24 text-xl',
  '2xl': 'w-32 h-32 text-2xl'
};

const statusColor = {
  'active': 'bg-status-online border-bg-primary',
  'banned': 'bg-status-offline border-bg-primary',
};

const AvatarInner: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className = '',
  isGroup,
  members = [],
  onClick
}) => {
  const renderContent = () => {
    const avatarUrl = typeof src === 'string' ? src : src?.url;
    const isSensitive = typeof src === 'object' && src?.isSensitive;

    if (avatarUrl && avatarUrl !== '/blank-avatar.png') {
      return (
        <img
          className={`w-full h-full object-cover ${isSensitive ? 'blur-md' : ''}`}
          src={avatarUrl}
          alt={name}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }

    if (isGroup && members.length > 0) {
      const displayMembers = members.slice(0, 4);
      const count = displayMembers.length;

      const getPositionClasses = (index: number, total: number) => {
        if (total === 1) return 'w-full h-full';

        if (total === 2) {
          return index === 0
            ? 'w-[62%] h-[62%] top-0 left-0 z-10'
            : 'w-[62%] h-[62%] bottom-0 right-0';
        }

        if (total === 3) {
          if (index === 0) return 'w-[56%] h-[56%] top-0 left-1/2 -translate-x-1/2 z-10';
          if (index === 1) return 'w-[56%] h-[56%] bottom-0 left-0';
          return 'w-[56%] h-[56%] bottom-0 right-0 z-20';
        }

        if (index === 0) return 'w-[54%] h-[54%] top-0 left-0 z-10';
        if (index === 1) return 'w-[54%] h-[54%] top-0 right-0';
        if (index === 2) return 'w-[54%] h-[54%] bottom-0 left-0 z-20';
        return 'w-[54%] h-[54%] bottom-0 right-0 z-30';
      };

      return (
        <div className="relative w-full h-full bg-transparent">
          {displayMembers.map((member, idx) => {
            const isLastOfMany = idx === 3 && members.length > 4;

            return (
              <div
                key={member.id || idx}
                className={`absolute rounded-full overflow-hidden border-2 border-bg-primary bg-bg-secondary flex items-center justify-center ${getPositionClasses(idx, count)}`}
              >
                {isLastOfMany ? (
                  <div className="w-full h-full flex items-center justify-center bg-bg-hover text-[8px] font-bold text-text-primary">
                    +{members.length - 3}
                  </div>
                ) : (
                  <>
                    {(member.avatar && (typeof member.avatar === 'string' ? member.avatar : member.avatar.url)) ? (
                      <img
                        src={typeof member.avatar === 'string' ? member.avatar : member.avatar.url}
                        alt=""
                        className={`w-full h-full object-cover ${typeof member.avatar === 'object' && member.avatar.isSensitive ? 'blur-sm' : ''}`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div
                      className="w-full h-full flex items-center justify-center text-[8px] font-bold text-text-on-primary uppercase"
                      style={{ background: getAvatarGradient(member.fullName || member.id) }}
                    >
                      {getInitials(member.fullName).substring(0, 1)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
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

  const avatarUrl = typeof src === 'string' ? src : src?.url;
  const isCompositeGrid = isGroup && members.length > 0 && (!avatarUrl || avatarUrl === '/blank-avatar.png');

  return (
    <div
      className={`relative inline-flex flex-shrink-0 ${sizeClasses[size]} rounded-full ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`w-full h-full relative rounded-full ${!isCompositeGrid ? 'overflow-hidden' : ''} ${!isGroup ? 'bg-bg-secondary' : 'bg-transparent'} ${size !== '2xs' && !isGroup ? 'border border-border-light' : ''} flex items-center justify-center`}>
        {renderContent()}
      </div>
      {status && (
        <span className={`absolute bottom-0 right-0 block h-[30%] w-[30%] rounded-full border-2 ${statusColor[status]} z-10`} />
      )}
    </div>
  );
};

export const Avatar = React.memo(AvatarInner);
