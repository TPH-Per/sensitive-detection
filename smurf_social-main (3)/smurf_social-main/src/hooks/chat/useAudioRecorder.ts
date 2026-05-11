import { useState, useRef, useCallback } from 'react';
import { TIME_LIMITS } from '../../constants/appConfig';

interface UseAudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onError?: (error: Error) => void;
}

export const useAudioRecorder = ({ onRecordingComplete, onError }: UseAudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob, durationRef.current);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setRecordingDuration(durationRef.current);

        if (durationRef.current >= TIME_LIMITS.VOICE_MAX_DURATION / 1000) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      console.error('Lỗi khi bắt đầu ghi âm:', err);
      let errorMsg = 'Không thể truy cập microphone. Vui lòng kiểm tra màn hình và quyền hệ thống.';
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.message.includes('Permission requested')) {
          errorMsg = 'Bạn chưa cấp quyền sử dụng Microphone cho trình duyệt.';
        } else if (err.name === 'NotFoundError' || err.message.includes('Requested device')) {
          errorMsg = 'Không tìm thấy thiết bị Microphone nào trên máy của bạn.';
        } else if (err.name === 'NotReadableError' || err.message.includes('in use') || err.message.includes('User request')) {
          errorMsg = 'Microphone đang được sử dụng bởi một ứng dụng/tab khác. Vui lòng tắt và thử lại.';
        }
      }
      
      onError?.(new Error(errorMsg));
    }
  }, [onRecordingComplete, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      audioChunksRef.current = [];
    }
  }, [isRecording]);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  };
};
