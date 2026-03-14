import React from 'react';
import { ReactionType } from '../../../../shared/types';

// Import SVG files as React components using ?react suffix
import SVGLike from '../../../assets/icons/like.svg?react';
import SVGLove from '../../../assets/icons/love.svg?react';
import SVGHaha from '../../../assets/icons/haha.svg?react';
import SVGWow from '../../../assets/icons/wow.svg?react';
import SVGSad from '../../../assets/icons/sad.svg?react';
import SVGAngry from '../../../assets/icons/angry.svg?react';
import SVGCancel from '../../../assets/icons/cancel.svg?react';

export interface ReactionIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

export const IconLike = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGLike width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconLove = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGLove width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconHaha = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGHaha width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconWow = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGWow width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconSad = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGSad width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconAngry = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGAngry width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const IconCancel = ({ size = 24, ...props }: ReactionIconProps) => (
  <SVGCancel width={size} height={size} style={{ overflow: 'visible' }} {...props} />
);

export const getReactionIcon = (type: ReactionType, className?: string, size: number | string = 24) => {
  switch (type) {
    case ReactionType.LIKE:
      return <IconLike className={className} size={size} />;
    case ReactionType.LOVE:
      return <IconLove className={className} size={size} />;
    case ReactionType.HAHA:
      return <IconHaha className={className} size={size} />;
    case ReactionType.WOW:
      return <IconWow className={className} size={size} />;
    case ReactionType.SAD:
      return <IconSad className={className} size={size} />;
    case ReactionType.ANGRY:
      return <IconAngry className={className} size={size} />;
    default: 
      return null;
  }
};
