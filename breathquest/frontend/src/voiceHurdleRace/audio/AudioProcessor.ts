/**
 * AudioProcessor - Handles Web Audio API integration
 * Captures microphone input and provides audio data for analysis
 */

export interface AudioData {
  timeDomain: Float32Array;
  frequencyData: Float32Array;
  sampleRate: number;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private isInitialized = false;

  /**
   * Initialize audio context and microphone access
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        }
      });

      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize audio processor:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  /**
   * Get current audio data
   */
  getAudioData(): AudioData | null {
    if (!this.analyser || !this.audioContext) return null;

    const timeDomain = new Float32Array(this.analyser.fftSize);
    const frequencyData = new Float32Array(this.analyser.frequencyBinCount);

    this.analyser.getFloatTimeDomainData(timeDomain);
    this.analyser.getFloatFrequencyData(frequencyData);

    return {
      timeDomain,
      frequencyData,
      sampleRate: this.audioContext.sampleRate,
    };
  }

  /**
   * Check if audio processor is initialized
   */
  isActive(): boolean {
    return this.isInitialized && this.audioContext?.state === 'running';
  }

  /**
   * Resume audio context if suspended
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Stop and cleanup audio resources
   */
  stop(): void {
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.isInitialized = false;
  }
}
