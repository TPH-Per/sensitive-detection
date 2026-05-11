import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { User } from '../types';

const geminiApiKey = defineString('GEMINI_API_KEY');

export const onUserProfileUpdated = onDocumentWritten({ document: "users/{userId}", database: 'per0', region: 'asia-southeast1' }, async (event) => {
  const change = event.data;
  if (!change) return;

  const before = change.before.data() as User | undefined;
  const after = change.after.data() as User | undefined;

  if (!after) return;

  // Kiểm tra thay đổi các trường quan trọng
  const interestsChanged = JSON.stringify(before?.interests || []) !== JSON.stringify(after.interests || []);
  const locationChanged = before?.location !== after.location;
  const schoolChanged = before?.school !== after.school;
  const generationChanged = before?.generation !== after.generation;

  if (!interestsChanged && !locationChanged && !schoolChanged && !generationChanged && after.userVector) {
    return;
  }

  const interestsText = after.interests?.length ? after.interests.join(", ") : "Không có";
  const profileText = `Sở thích: ${interestsText}. Địa điểm: ${after.location || "Không rõ"}. Trường học: ${after.school || "Không rõ"}. Thế hệ: ${after.generation || "Không rõ"}.`;
  
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });
    const result = await model.embedContent(profileText);
    
    await change.after.ref.update({
      userVector: result.embedding.values
    });
  } catch (error) {
    console.error(`Lỗi tạo Embedding cho user ${event.params.userId}:`, error);
  }
});
