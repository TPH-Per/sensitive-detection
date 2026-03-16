/**
 * Hàm hỗ trợ tải tập tin từ URL, buộc trình duyệt tải về thay vì mở trực tiếp.
 */
export const downloadFile = async (url: string, fileName: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Lỗi khi tải tập tin:', error);
    // Fallback sang mở tab mới nếu fetch bị chặn
    window.open(url, '_blank');
  }
};
