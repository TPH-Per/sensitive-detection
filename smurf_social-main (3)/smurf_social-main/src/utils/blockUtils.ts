import { BlockOptions } from '../../shared/types';

/**
 * Kiểm tra xem người dùng có đang ở trạng thái chặn hoàn toàn (4 options) hay không
 * @param options Tùy chọn chặn
 * @returns true nếu cả 4 options đều được bật
 */
export const isFullyBlocked = (options?: BlockOptions): boolean => {
  if (!options) return false;
  return (
    options.blockMessages === true &&
    options.blockCalls === true &&
    options.blockViewMyActivity === true &&
    options.hideTheirActivity === true
  );
};
