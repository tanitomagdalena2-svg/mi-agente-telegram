import axios from 'axios';
import FormData from 'form-data';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('❌ FALTA ELEVENLABS_API_KEY en variables de entorno');
}

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsService {
  private apiKey: string;
  private defaultVoiceId = 'Xb7hH8MSUJpSbSDYk0k2'; // Alice - voz con español

  constructor() {
    this.apiKey = ELEVENLABS_API_KEY || '';
  }

  async getDefaultVoice(): Promise<string> {
    return this.defaultVoiceId;
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBuffer, 'audio.ogg');
      formData.append('model_id', 'scribe_v1');

      const response = await axios.post(
        `${BASE_URL}/speech-to-text`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'xi-api-key': this.apiKey
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30000
        }
      );

      return response.data?.text || "[Silencio]";
    } catch (error) {
      console.error('❌ Error en ElevenLabs STT:');
      if (axios.isAxiosError(error) && error.response) {
        console.error('Código:', error.response.status);
        console.error('Detalles:', error.response.data);
      }
      return "[No se pudo transcribir el audio]";
    }
  }

  async synthesizeSpeech(
    text: string,
    voiceId?: string,
    options?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
    }
  ): Promise<Buffer> {
    const finalVoiceId = voiceId || this.defaultVoiceId;
    try {
      const response = await axios.post(
        `${BASE_URL}/text-to-speech/${finalVoiceId}`,
        {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: options?.stability ?? 0.5,
            similarity_boost: options?.similarityBoost ?? 0.75,
            style: options?.style ?? 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('❌ Error en ElevenLabs TTS:', error);
      throw error;
    }
  }

  async getVoices(): Promise<any[]> {
    try {
      const response = await axios.get(`${BASE_URL}/voices`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      return response.data.voices || [];
    } catch (error) {
      console.error('❌ Error obteniendo voces:', error);
      return [];
    }
  }
}

export const elevenLabs = new ElevenLabsService();
