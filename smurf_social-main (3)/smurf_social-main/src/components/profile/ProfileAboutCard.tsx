import React from 'react';
import { 
  Cake, MapPin, GraduationCap, Heart, CalendarDays, 
  Mail, Globe, Users as UsersIcon, Lock 
} from 'lucide-react';
import { Gender, MaritalStatus, User, Visibility } from '../../../shared/types';
import { toDate } from '../../utils/dateUtils';

interface ProfileAboutCardProps {
  profile: User;
  isOwnProfile?: boolean;
}

export const ProfileAboutCard: React.FC<ProfileAboutCardProps> = ({ profile, isOwnProfile }) => {
  const hasDetails = profile.email || profile.gender || profile.dob || profile.location || profile.school || 
                     profile.maritalStatus || profile.createdAt || 
                     (profile.interests && profile.interests.length > 0);

  const PrivacyIcon = ({ field }: { field: string }) => {
    if (!isOwnProfile || !profile.profilePrivacy) return null;
    const visibility = (profile.profilePrivacy as any)[field] as Visibility;
    
    return (
      <div className="ml-auto text-text-tertiary opacity-40 hover:opacity-100 transition-opacity cursor-help" title={`Quyền riêng tư: ${visibility === Visibility.PUBLIC ? 'Công khai' : visibility === Visibility.FRIENDS ? 'Bạn bè' : 'Chỉ mình tôi'}`}>
        {visibility === Visibility.PUBLIC && <Globe size={12} />}
        {visibility === Visibility.FRIENDS && <UsersIcon size={12} />}
        {visibility === Visibility.PRIVATE && <Lock size={12} />}
      </div>
    );
  };

  return (
    <div className="bg-bg-primary rounded-2xl border border-border-light p-4 shadow-sm">
      <h3 className="font-semibold text-base text-text-primary mb-4">Giới thiệu</h3>

      {profile.bio && (
        <p className="text-sm text-text-secondary italic text-center mb-4 leading-relaxed px-2">
          "{profile.bio}"
        </p>
      )}

      {hasDetails ? (
        <div className="space-y-3">
          {profile.gender && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <UsersIcon size={15} />
              </div>
              <span className="flex-1">
                Giới tính{' '}
                <strong className="text-text-primary font-medium">
                  {profile.gender === Gender.MALE ? 'Nam' : 'Nữ'}
                </strong>
              </span>
              <PrivacyIcon field="gender" />
            </div>
          )}

          {profile.dob && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <Cake size={15} />
              </div>
              <span className="flex-1">
                Sinh ngày{' '}
                <strong className="text-text-primary font-medium">
                  {toDate(profile.dob)?.toLocaleDateString('vi-VN')}
                </strong>
              </span>
              <PrivacyIcon field="dob" />
            </div>
          )}

          {profile.email && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group overflow-hidden">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <Mail size={15} />
              </div>
              <span className="flex-1 truncate">
                Email{' '}
                <strong className="text-text-primary font-medium">
                  {profile.email}
                </strong>
              </span>
              <PrivacyIcon field="email" />
            </div>
          )}

          {profile.location && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <MapPin size={15} />
              </div>
              <span className="flex-1">
                Đến từ{' '}
                <strong className="text-text-primary font-medium">
                  {profile.location}
                </strong>
              </span>
              <PrivacyIcon field="location" />
            </div>
          )}

          {profile.school && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <GraduationCap size={15} />
              </div>
              <span className="flex-1">
                Từng học tại <strong className="text-text-primary font-medium">{profile.school}</strong>
              </span>
              <PrivacyIcon field="school" />
            </div>
          )}

          {profile.maritalStatus && profile.maritalStatus !== MaritalStatus.NONE && (
            <div className="flex items-center gap-3 text-sm text-text-secondary group">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <Heart size={15} />
              </div>
              <span className="flex-1">
                Trạng thái:{' '}
                <strong className="text-text-primary font-medium">
                  {profile.maritalStatus === MaritalStatus.SINGLE ? 'Độc thân vui vẻ' :
                   profile.maritalStatus === MaritalStatus.MARRIED ? 'Đã kết hôn' :
                   profile.maritalStatus === MaritalStatus.DIVORCED ? 'Đã ly hôn' :
                   profile.maritalStatus === MaritalStatus.WIDOWED ? 'Chăn đơn gối chiếc' :
                   'Mối quan hệ phức tạp'}
                </strong>
              </span>
              <PrivacyIcon field="maritalStatus" />
            </div>
          )}

          {profile.createdAt && (
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <div className="w-8 h-8 flex items-center justify-center bg-bg-secondary rounded-lg flex-shrink-0">
                <CalendarDays size={15} />
              </div>
              <span>
                Tham gia từ{' '}
                <strong className="text-text-primary font-medium">
                  Tháng {toDate(profile.createdAt)?.toLocaleDateString('vi-VN', { month: 'numeric', year: 'numeric' })}
                </strong>
              </span>
            </div>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <div className="pt-3 mt-3 border-t border-border-light/60">
              <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2.5 ml-1">Sở thích</h4>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.map(tag => (
                  <span key={tag} className="px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary text-center py-2">
          Chưa có thông tin giới thiệu
        </p>
      )}
    </div>
  );
};
