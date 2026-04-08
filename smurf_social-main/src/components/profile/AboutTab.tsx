import React from 'react';
import { Mail, MapPin, Calendar, User as UserIcon, GraduationCap, Heart, Tag } from 'lucide-react';
import { User, MaritalStatus } from '../../../shared/types';
import { formatDob } from '../../utils/dateUtils';

interface AboutTabProps {
  user: User;
}

const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  [MaritalStatus.NONE]: 'Không muốn nói',
  [MaritalStatus.SINGLE]: 'Độc thân',
  [MaritalStatus.MARRIED]: 'Đã kết hôn',
  [MaritalStatus.DIVORCED]: 'Đã ly hôn',
  [MaritalStatus.WIDOWED]: 'Góa',
  [MaritalStatus.OTHER]: 'Khác',
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon, label, value,
}) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 flex items-center justify-center bg-bg-secondary rounded-xl flex-shrink-0 text-text-secondary">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-text-tertiary font-medium">{label}</p>
      <p className="text-sm text-text-primary font-medium truncate">{value}</p>
    </div>
  </div>
);

export const AboutTab: React.FC<AboutTabProps> = ({ user }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

    {/* Contact info */}
    <div className="bg-bg-primary rounded-2xl border border-border-light p-5 space-y-4">
      <h3 className="font-semibold text-base text-text-primary">Thông tin liên hệ</h3>
      <InfoRow icon={<Mail size={16} />} label="Email" value={user.email} />
      {user.location && (
        <InfoRow icon={<MapPin size={16} />} label="Địa điểm" value={user.location} />
      )}
    </div>

    {/* Basic info */}
    <div className="bg-bg-primary rounded-2xl border border-border-light p-5 space-y-4">
      <h3 className="font-semibold text-base text-text-primary">Thông tin cơ bản</h3>
      <InfoRow
        icon={<UserIcon size={16} />}
        label="Giới tính"
        value={user.gender === 'male' ? 'Nam' : user.gender === 'female' ? 'Nữ' : 'Khác'}
      />
      {user.dob && (
        <InfoRow icon={<Calendar size={16} />} label="Ngày sinh" value={formatDob(user.dob)} />
      )}
      {user.maritalStatus && user.maritalStatus !== MaritalStatus.NONE && (
        <InfoRow
          icon={<Heart size={16} />}
          label="Tình trạng hôn nhân"
          value={MARITAL_STATUS_LABELS[user.maritalStatus]}
        />
      )}
      {user.school && (
        <InfoRow icon={<GraduationCap size={16} />} label="Trường học" value={user.school} />
      )}
    </div>

    {/* Bio */}
    {user.bio && (
      <div className="bg-bg-primary rounded-2xl border border-border-light p-5 md:col-span-2">
        <h3 className="font-semibold text-base text-text-primary mb-3">Giới thiệu</h3>
        <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed italic">
          "{user.bio}"
        </p>
      </div>
    )}

    {/* Interests */}
    {user.interests && user.interests.length > 0 && (
      <div className="bg-bg-primary rounded-2xl border border-border-light p-5 md:col-span-2">
        <h3 className="font-semibold text-base text-text-primary mb-3 flex items-center gap-2">
          <Tag size={15} className="text-text-tertiary" />
          Sở thích
        </h3>
        <div className="flex flex-wrap gap-2">
          {user.interests.map(tag => (
            <span
              key={tag}
              className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
);
