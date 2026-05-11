import { z } from 'zod';
import { VALIDATION, GROUP_LIMITS, REPORT_CONFIG, MEDIA_CONSTRAINTS } from '../constants/appConfig';
import { ReportReason, Visibility, Gender, MaritalStatus, PostType, Generation } from '../../shared/types';

// Schema cho Đăng nhập
export const loginSchema = z.object({
  email: z.string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ'),
  password: z.string()
    .min(1, 'Vui lòng nhập mật khẩu')
    .min(VALIDATION.PASSWORD_MIN_LENGTH, `Mật khẩu phải có ít nhất ${VALIDATION.PASSWORD_MIN_LENGTH} ký tự`),
});

// Quy tắc chung cho ngày sinh
const dobValidation = z.number({ message: 'Vui lòng chọn ngày sinh' })
  .refine((val) => val <= Date.now(), 'Ngày sinh không được là ngày trong tương lai')
  .refine((val) => {
    const age = (Date.now() - val) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 13;
  }, 'Bạn phải từ 13 tuổi trở lên')
  .refine((val) => {
    const age = (Date.now() - val) / (365.25 * 24 * 60 * 60 * 1000);
    return age <= 120;
  }, 'Ngày sinh không hợp lệ');

// Schema cho Đăng ký
export const registerSchema = z.object({
  name: z.string()
    .min(1, 'Vui lòng nhập họ tên')
    .max(VALIDATION.USER_NAME_MAX_LENGTH, `Họ tên không được quá ${VALIDATION.USER_NAME_MAX_LENGTH} ký tự`),
  email: z.string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ'),
  dob: dobValidation,
  password: z.string()
    .min(1, 'Vui lòng nhập mật khẩu')
    .min(VALIDATION.PASSWORD_MIN_LENGTH, `Mật khẩu phải có ít nhất ${VALIDATION.PASSWORD_MIN_LENGTH} ký tự`),
  confirmPassword: z.string()
    .min(1, 'Vui lòng xác nhận mật khẩu'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
});

// Schema cho Quên mật khẩu
export const forgotPasswordSchema = z.object({
  email: z.string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ'),
});

// Schema cho Chỉnh sửa hồ sơ
export const profileSchema = z.object({
  fullName: z.string()
    .min(1, 'Tên không được để trống')
    .max(VALIDATION.USER_NAME_MAX_LENGTH, `Tên không được quá ${VALIDATION.USER_NAME_MAX_LENGTH} ký tự`),
  bio: z.string()
    .max(VALIDATION.BIO_MAX_LENGTH, `Giới thiệu không được quá ${VALIDATION.BIO_MAX_LENGTH} ký tự`)
    .optional(),
  location: z.string().optional(),
  gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.NONE]).optional(),
  dob: dobValidation,
  school: z.string().max(100, 'Trường học không được quá 100 ký tự').optional(),
  maritalStatus: z.enum([MaritalStatus.NONE, MaritalStatus.SINGLE, MaritalStatus.MARRIED, MaritalStatus.DIVORCED, MaritalStatus.WIDOWED, MaritalStatus.OTHER]).optional(),
  interests: z.array(z.string()).optional(),
  generation: z.nativeEnum(Generation).optional(),
  profilePrivacy: z.object({
    email: z.nativeEnum(Visibility),
    dob: z.nativeEnum(Visibility),
    gender: z.nativeEnum(Visibility),
    location: z.nativeEnum(Visibility),
    school: z.nativeEnum(Visibility),
    maritalStatus: z.nativeEnum(Visibility),
  }).optional(),
});

// Schema cho Onboarding
export const onboardingSchema = z.object({
  location: z.string().optional(),
  interests: z.array(z.string()).max(VALIDATION.INTEREST_MAX_COUNT, `Tối đa ${VALIDATION.INTEREST_MAX_COUNT} sở thích`).optional(),
});

// Schema cho Đổi mật khẩu
export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z.string()
    .min(1, 'Vui lòng nhập mật khẩu mới')
    .min(VALIDATION.PASSWORD_MIN_LENGTH, `Mật khẩu mới phải có ít nhất ${VALIDATION.PASSWORD_MIN_LENGTH} ký tự`),
  confirmPassword: z.string()
    .min(1, 'Vui lòng xác nhận mật khẩu mới'),
}).refine((data) => data.newPassword !== data.currentPassword, {
  message: "Mật khẩu mới không được trùng với mật khẩu hiện tại",
  path: ["newPassword"],
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
});

// Schema cho Bài viết
export const postSchema = z.object({
  content: z.string()
    .max(VALIDATION.POST_CONTENT_MAX_LENGTH, `Nội dung không được quá ${VALIDATION.POST_CONTENT_MAX_LENGTH} ký tự`)
    .optional()
    .or(z.literal('')),
  visibility: z.enum([Visibility.FRIENDS, Visibility.PUBLIC, Visibility.PRIVATE]),
  media: z.array(z.any())
    .max(MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST, `Chỉ được tải lên tối đa ${MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST} media`),
  hasPendingFiles: z.boolean().optional(),
  type: z.enum([PostType.REGULAR, PostType.AVATAR_UPDATE, PostType.COVER_UPDATE]).optional(),
}).refine(data => {
  if (data.type && data.type !== PostType.REGULAR) return true;
  
  const hasContent = data.content?.trim()?.length && data.content.trim().length > 0;
  const hasMedia = data.media && data.media.length > 0;
  const hasPending = !!data.hasPendingFiles;
  return hasContent || hasMedia || hasPending;
}, {
  message: "Bài viết không được để trống",
  path: ["content"],
});

// Schema cho Báo cáo
export const reportSchema = z.object({
  reason: z.string().min(1, 'Vui lòng chọn lý do báo cáo'),
  description: z.string()
    .max(REPORT_CONFIG.DESCRIPTION_MAX_LENGTH, `Mô tả không được quá ${REPORT_CONFIG.DESCRIPTION_MAX_LENGTH} ký tự`)
    .optional()
    .or(z.literal('')),
  images: z.array(z.string())
    .max(REPORT_CONFIG.MAX_IMAGES_PER_REPORT, `Chỉ được tải lên tối đa ${REPORT_CONFIG.MAX_IMAGES_PER_REPORT} ảnh bằng chứng`)
    .optional(),
}).refine(data => {
  if (data.reason === ReportReason.OTHER && !data.description?.trim()) return false;
  return true;
}, {
  message: "Vui lòng mô tả chi tiết lý do",
  path: ["description"],
});

// Schema cho Nhóm chat
export const groupSchema = z.object({
  name: z.string()
    .min(1, 'Tên nhóm không được để trống')
    .max(GROUP_LIMITS.NAME_MAX_LENGTH, `Tên nhóm không được quá ${GROUP_LIMITS.NAME_MAX_LENGTH} ký tự`),
  memberIds: z.array(z.string())
    .min(GROUP_LIMITS.MIN_MEMBERS, `Nhóm phải có ít nhất ${GROUP_LIMITS.MIN_MEMBERS} thành viên`)
    .max(GROUP_LIMITS.MAX_MEMBERS, `Nhóm tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`),
});

// Schema cho Bình luận
export const commentSchema = z.object({
  content: z.string()
    .max(VALIDATION.COMMENT_MAX_LENGTH, `Bình luận không được quá ${VALIDATION.COMMENT_MAX_LENGTH} ký tự`)
    .optional()
    .or(z.literal('')),
  image: z.string().optional(),
  hasPendingImage: z.boolean().optional(),
}).refine(data => data.content?.trim() || data.image || data.hasPendingImage, {
  message: "Bình luận không được để trống",
  path: ["content"],
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
export type OnboardingFormValues = z.infer<typeof onboardingSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type PostFormValues = z.infer<typeof postSchema>;
export type ReportFormValues = z.infer<typeof reportSchema>;
export type GroupFormValues = z.infer<typeof groupSchema>;
export type CommentFormValues = z.infer<typeof commentSchema>;

