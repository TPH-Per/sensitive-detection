import React from 'react';
import { Mail, MapPin, Calendar, User as UserIcon } from 'lucide-react';
import { User } from '../../types';
import { formatDob } from '../../utils/dateUtils';

interface AboutTabProps {
  user: User;
}

export const AboutTab: React.FC<AboutTabProps> = ({ user }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* Thông tin liên hệ */}
      <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-6">
        <h3 className="font-bold text-lg mb-4 text-text-primary">Thông tin liên hệ</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Mail size={20} className="text-text-secondary mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-text-secondary">Email</p>
              <p className="text-text-primary">{user.email}</p>
            </div>
          </div>

          {user.location && (
            <div className="flex items-start gap-3">
              <MapPin size={20} className="text-text-secondary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-text-secondary">Địa điểm</p>
                <p className="text-text-primary">{user.location}</p>
              </div>
            </div>
          )}


        </div>
      </div>

      {/* Thông tin cơ bản */}
      <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-6">
        <h3 className="font-bold text-lg mb-4 text-text-primary">Thông tin cơ bản</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <UserIcon size={20} className="text-text-secondary mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-text-secondary">Giới tính</p>
              <p className="text-text-primary">
                {user.gender === 'male' ? 'Nam' : user.gender === 'female' ? 'Nữ' : 'Khác'}
              </p>
            </div>
          </div>

          {user.dob && (
            <div className="flex items-start gap-3">
              <Calendar size={20} className="text-text-secondary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-text-secondary">Ngày sinh</p>
                <p className="text-text-primary">
                  {formatDob(user.dob)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Giới thiệu */}
      {user.bio && (
        <div className="bg-bg-primary rounded-lg shadow-sm border border-border-light p-6 md:col-span-2">
          <h3 className="font-bold text-lg mb-4 text-text-primary">Giới thiệu</h3>
          <p className="text-text-primary whitespace-pre-wrap">{user.bio}</p>
        </div>
      )}

    </div>
  );
};
