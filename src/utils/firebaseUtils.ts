import { DocumentSnapshot, Timestamp } from 'firebase/firestore';

/**
 * Chuyển đổi Firestore document thành Object kèm ID và định dạng Timestamp
 */
export function convertDoc<T>(doc: DocumentSnapshot): T {
  const data = doc.data();
  if (!data) return {} as T;

  const result: any = { ...data, id: doc.id };

  // Đệ quy xử lý các trường Timestamp
  Object.keys(result).forEach(key => {
    if (result[key] instanceof Timestamp) {
      // Giữ nguyên Timestamp để frontend xử lý theo nhu cầu
    }
  });

  return result as T;
}

/**
 * Xử lý danh sách documents
 */
export function convertDocs<T>(docs: DocumentSnapshot[]): T[] {
  return docs.map(doc => convertDoc<T>(doc));
}
