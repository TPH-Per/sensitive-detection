import { format, formatDistanceToNow, isYesterday, isToday, differenceInDays, getYear } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

export type DateLike = Date | Timestamp | string | number | null | undefined;

export const toDate = (val: DateLike): Date | null => {
  if (!val) return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  if (val instanceof Timestamp) return val.toDate();

  if (typeof val === 'object' && val !== null && 'seconds' in (val as object)) {
    return new Date((val as { seconds: number }).seconds * 1000);
  }

  if (typeof val === 'string' || typeof val === 'number') {
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
};

// Firestore Timestamp → Date, fallback về giá trị gốc nếu không hợp lệ
export const convertTimestamp = (val: DateLike, fallback?: Date): Date | undefined => {
  const result = toDate(val);
  if (result) return result;
  if (fallback) return fallback;
  return undefined;
};

// Hiển thị thời gian thu gọn kiểu Facebook
export const formatRelativeTime = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Vừa xong';

  const days = differenceInDays(now, d);
  if (days >= 7) {
    const isSameYear = getYear(d) === getYear(now);
    const dateFormat = isSameYear ? 'dd/MM' : 'dd/MM/yyyy';
    return `${format(d, dateFormat)} lúc ${format(d, 'HH:mm')}`;
  }

  const timeStr = formatDistanceToNow(d, { locale: vi });

  // Chuẩn hóa thành cụm từ ngắn gọn
  return timeStr
    .replace('khoảng ', '')
    .replace('một ', '1 ')
    .replace('dưới 1 phút', 'Vừa xong');
};

// Định dạng thời gian hội thoại
export const formatChatTime = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';

  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Hôm qua';

  if (differenceInDays(new Date(), d) < 7) {
    return format(d, 'eeee', { locale: vi });
  }

  return format(d, 'dd/MM/yyyy');
};

// Trạng thái hoạt động người dùng
export const formatStatusTime = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';

  const now = new Date();

  if (differenceInDays(now, d) >= 7) {
    return `Hoạt động ngày ${format(d, 'dd/MM/yyyy')}`;
  }

  const timeAgo = formatDistanceToNow(d, { addSuffix: true, locale: vi });
  return `Hoạt động ${timeAgo}`;
};

// Định dạng đầy đủ cho tooltip
export const formatDateTime = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';
  return format(d, 'HH:mm dd/MM/yyyy');
};

// Chỉ hiển thị giờ và phút
export const formatTimeOnly = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';
  return format(d, 'HH:mm');
};

// Ngày sinh dạng "01 tháng 1 2000"
export const formatDob = (date: DateLike): string => {
  const d = toDate(date);
  if (!d) return '';
  return format(d, 'dd MMMM yyyy', { locale: vi });
};
