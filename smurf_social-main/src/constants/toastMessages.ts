export const TOAST_MESSAGES = {
  AUTH: {
    REGISTER_SUCCESS: 'Đăng ký thành công! Vui lòng kiểm tra email.',
    VERIFY_EMAIL_SUCCESS: 'Xác thực email thành công!',
    VERIFY_EMAIL_PENDING: 'Email vẫn chưa được xác thực. Vui lòng kiểm tra lại.',
    RESEND_VERIFY_SUCCESS: 'Đã gửi lại email xác thực!',
    RESET_PASSWORD_SUCCESS: 'Đã gửi email khôi phục!',
    CHANGE_PASSWORD_SUCCESS: 'Mật khẩu đã được đổi. Vui lòng đăng nhập lại!',
    SEND_EMAIL_FAILED: 'Không thể gửi email lúc này.',
    CHECK_STATUS_FAILED: 'Không thể kiểm tra trạng thái lúc này.',
  },

  POST: {
    CREATE_SUCCESS: 'Đã đăng bài viết mới!',
    UPDATE_SUCCESS: 'Đã cập nhật bài viết!',
    DELETE_SUCCESS: 'Đã xóa bài viết!',
    CREATE_FAILED: (detail?: string) => detail ? `Không thể đăng bài viết: ${detail}` : 'Không thể đăng bài viết.',
    UPDATE_FAILED: (detail?: string) => detail ? `Không thể cập nhật bài viết: ${detail}` : 'Không thể cập nhật bài viết.',
    DELETE_FAILED: 'Không thể xóa bài viết.',
    MEDIA_LIMIT: (max: number) => `Chỉ được chọn tối đa ${max} ảnh/video cho mỗi bài viết.`,
    VIDEO_LIMIT: (max: number) => `Mỗi bài viết chỉ được tải lên tối đa ${max} video.`,
  },

  PROFILE: {
    UPDATE_SUCCESS: 'Cập nhật thông tin thành công!',
    UPDATE_FAILED: 'Không thể cập nhật thông tin.',
  },

  MEDIA: {
    UPLOAD_AVATAR_FAILED: 'Không thể tải lên ảnh đại diện.',
    UPLOAD_COVER_FAILED: 'Không thể tải lên ảnh bìa.',
    DELETE_AVATAR_SUCCESS: 'Đã xóa ảnh đại diện.',
    DELETE_COVER_SUCCESS: 'Đã xóa ảnh bìa.',
    DELETE_AVATAR_FAILED: 'Không thể xóa ảnh đại diện.',
    DELETE_COVER_FAILED: 'Không thể xóa ảnh bìa.',
    INVALID_FILE: 'Vui lòng chọn file ảnh.',
    FILE_TOO_LARGE: (limit: number, label: string) => `${label} quá lớn. Giới hạn ${limit}MB.`,
  },

  FRIEND: {
    ACCEPT_SUCCESS: 'Đã trở thành bạn bè!',
    CANCEL_SUCCESS: 'Đã hủy lời mời kết bạn.',
    SEND_SUCCESS: 'Đã gửi lời mời kết bạn.',
    UNFRIEND_SUCCESS: 'Đã hủy kết bạn.',
    UNFRIEND_FAILED: 'Không thể hủy kết bạn.',
    BLOCKED_USER: 'Không thể tương tác với người dùng đã bị khóa.',
    ACTION_FAILED: (detail?: string) => detail || 'Thao tác thất bại.',
  },

  BLOCK: {
    BLOCK_SUCCESS: 'Đã chặn người dùng.',
    UNBLOCK_SUCCESS: 'Đã bỏ chặn người dùng.',
    BLOCK_FAILED: 'Không thể chặn người dùng.',
    UNBLOCK_FAILED: 'Không thể bỏ chặn người dùng.',
  },

  CHAT: {
    SEND_FAILED: 'Không thể gửi tin nhắn.',
    BLOCKED_USER: 'Không thể nhắn tin cho người dùng đã bị khóa.',
    OPEN_FAILED: 'Không thể mở cuộc hội thoại.',
    UPDATE_GROUP_FAILED: 'Không thể cập nhật nhóm.',
    FILE_LIMIT: (max: number) => `Chỉ được gửi tối đa ${max} file cùng lúc.`,
    AUDIO_PLAY_FAILED: 'Không thể phát file âm thanh này.',
  },

  REPORT: {
    SUBMIT_SUCCESS: 'Đã gửi báo cáo. Chúng tôi sẽ xem xét trong thời gian sớm nhất.',
    SUBMIT_FAILED: 'Có lỗi xảy ra khi gửi báo cáo.',
    IMAGE_LIMIT: (max: number) => `Chỉ được tải lên tối đa ${max} ảnh.`,
    LOAD_FAILED: 'Không thể tải báo cáo.',
    NOT_FOUND: 'Không tìm thấy báo cáo.',
    LOAD_DETAIL_FAILED: 'Không thể tải chi tiết báo cáo.',
    RESOLVE_SUCCESS: 'Đã xóa nội dung vi phạm.',
    WARN_SUCCESS: 'Đã gửi cảnh báo.',
    BAN_SUCCESS: 'Đã khóa tài khoản.',
    REJECT_SUCCESS: 'Đã từ chối báo cáo.',
    PROCESS_FAILED: 'Không thể xử lý báo cáo.',
    REPORT_RESOLVED_SUCCESS: 'Đã xử lý báo cáo và xóa nội dung vi phạm.',
    REPORT_REJECTED_SUCCESS: 'Đã từ chối báo cáo.',
  },

  ADMIN: {
    NO_PERMISSION: 'Bạn không có quyền truy cập trang này.',
    LOAD_USERS_FAILED: 'Không thể tải danh sách người dùng.',
    BAN_SUCCESS: (name: string) => `Đã khóa tài khoản ${name}.`,
    UNBAN_SUCCESS: (name: string) => `Đã mở khóa tài khoản ${name}.`,
    BAN_FAILED: 'Không thể khóa tài khoản.',
    UNBAN_FAILED: 'Không thể mở khóa tài khoản.',
  },
} as const;
