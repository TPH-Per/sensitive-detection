import NotificationSound from '../assets/sounds/message-notification.mp3';

export type SoundType = 'message';

class SoundManager {
  private static instance: SoundManager;
  private audio: HTMLAudioElement | null = null;
  private lastPlayed: number = 0;
  private readonly THROTTLE_MS = 1500;
  private isUnlocked = false;
  private bc: BroadcastChannel;

  private constructor() {
    this.bc = new BroadcastChannel('smurf_sound_sync');
    this.setupSync();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private setupSync(): void {
    this.bc.onmessage = (event) => {
      if (event.data.type === 'SOUND_PLAYED') {
        this.lastPlayed = event.data.timestamp;
      }
    };
  }

  public async unlock(): Promise<void> {
    if (this.isUnlocked) return;

    try {
      if (!this.audio) {
        this.audio = new Audio(NotificationSound);
        this.audio.load();
      }

      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      
      this.isUnlocked = true;
      console.debug('[SoundManager] Audio unlocked.');
    } catch (err) {
      console.debug('[SoundManager] Automatic unlock failed:', err);
    }
  }

  /**
   * Play a sound, considering visibility and cross-tab sync.
   */
  public async play(type: SoundType = 'message', options: { force?: boolean } = {}): Promise<void> {
    const now = Date.now();

    if (!options.force && now - this.lastPlayed < this.THROTTLE_MS) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (now - this.lastPlayed < this.THROTTLE_MS) return; 
    }

    try {
      if (!this.audio) {
        this.audio = new Audio(NotificationSound);
      }

      this.audio.currentTime = 0;
      this.audio.volume = 1.0;
      
      await this.audio.play();
      
      this.lastPlayed = Date.now();
      this.bc.postMessage({ type: 'SOUND_PLAYED', timestamp: this.lastPlayed });
    } catch (err) {
      console.warn('[SoundManager] Play failed (Blocked by browser):', err);
    }
  }
}

export const soundManager = SoundManager.getInstance();
