import { User, Visibility, ProfilePrivacy } from '../../shared/types';

/**
 * Kiểm tra quyền xem một trường thông tin
 */
export const canViewField = (
  fieldVisibility: Visibility,
  isOwner: boolean,
  isFriend: boolean
): boolean => {
  if (isOwner) return true;
  if (fieldVisibility === Visibility.PUBLIC) return true;
  if (fieldVisibility === Visibility.FRIENDS) return isFriend;
  return false;
};

/**
 * Lọc sạch Profile dựa trên quyền riêng tư
 */
export const getMaskedProfile = (
  profile: User,
  currentUserId: string,
  isFriend: boolean,
  privacySettings?: ProfilePrivacy
): User => {
  const isOwner = profile.id === currentUserId;
  if (!privacySettings) return profile;

  const maskedProfile = { ...profile };

  const privacyFields: (keyof ProfilePrivacy)[] = [
    'email', 'dob', 'gender', 'location', 'school', 'maritalStatus'
  ];

  privacyFields.forEach((field) => {
    const visibility = privacySettings[field] || Visibility.FRIENDS;
    if (!canViewField(visibility, isOwner, isFriend)) {
      delete (maskedProfile as any)[field];
    }
  });

  const dobVisibility = privacySettings.dob || Visibility.FRIENDS;
  if (!canViewField(dobVisibility, isOwner, isFriend)) {
    delete maskedProfile.generation;
  }

  return maskedProfile;
}
