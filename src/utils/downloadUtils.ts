/**
 * Tải file về máy, buộc trình duyệt download thay vì mở trực tiếp.
 */
export const downloadFile = (url: string, fileName: string): void => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'blob';

  xhr.onload = () => {
    if (xhr.status !== 200) {
      _fallbackDownload(url, fileName);
      return;
    }

    const blob = xhr.response as Blob;
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || 'download';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  xhr.onerror = () => _fallbackDownload(url, fileName);

  xhr.send();
};

const _fallbackDownload = (url: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'download';
  link.target = '_self';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
