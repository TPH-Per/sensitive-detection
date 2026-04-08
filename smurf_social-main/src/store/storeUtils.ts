/**
 * Tiện ích quản lý State trung tâm.
 */

type ResetFn = () => void;
const reseters: Set<ResetFn> = new Set();

/**
 * Đăng ký hàm reset cho store.
 * @param resetFn Hàm thực hiện reset state về mặc định
 */
export const registerStore = (resetFn: ResetFn) => {
  reseters.add(resetFn);
  return () => {
    reseters.delete(resetFn);
  };
};

/**
 * Reset tất cả các store đã đăng ký.
 */
export const resetAllStores = () => {
  reseters.forEach((reset) => reset());
};

/**
 * Helper để cập nhật mảng lồng nhau (không cần immer).
 */
export const updateMapItem = <T>(
  map: Record<string, T[]>, 
  key: string, 
  updateFn: (items: T[]) => T[]
) => {
  const current = map[key] || [];
  const updated = updateFn(current);
  return { ...map, [key]: updated };
};
