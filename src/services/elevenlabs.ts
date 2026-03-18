import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('❌ FALTA ELEVENLABS_API_KEY en variables de entorno');
}

// Inicializar cliente oficial
const client = new ElevenLabsClient({
  apiKey: ELEVENLABS_API_KEY
});

export class ElevenLabsService {
  private defaultVoiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Voz del ejemplo (Georgia)

  constructor() {}

  async getDefaultVoice(): Promise<string> {
    return this.defaultVoiceId;
  }

  /**
   * Transcribe audio a texto usando ElevenLabs STT
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // ElevenLabs aún no tiene librería oficial para STT, mantenemos Axios
      const FormData = (await import('form-data')).default;
      const axios = (await import('axios')).default;
      
      const formData = new FormData();
      formData.append('audio', audioBuffer, 'audio.ogg');
      formData.append('model_id', 'scribe_v1');

      const response = await axios.post(
        'https://api.elevenlabs.io/v1/speech-to-text',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'xi-api-key': ELEVENLABS_API_KEY
          },
          timeout: 30000
        }
      );

      return response.data?.text || "[Silencio]";
    } catch (error) {
      console.error('❌ Error en ElevenLabs STT:', error);
      return "[Error al transcribir el audio]";
    }
  }

  /**
   * Transcribe audio desde Buffer (wrapper)
   */
  async transcribeFromBuffer(audioBuffer: Buffer): Promise<string> {
    try {
      console.log(`🎤 Transcribiendo audio: ${audioBuffer.length} bytes`);
      return await this.transcribeAudio(audioBuffer);
    } catch (error) {
      console.error('❌ Error transcribiendo audio:', error);
      return "[Error al transcribir el audio]";
    }
  }

  /**
   * Sintetiza voz a partir de texto usando librería oficial
   */
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
      console.log(`🔊 Generando voz con ElevenLabs (${finalVoiceId})...`);
      
      // Usar la librería oficial para TTS
      const audioStream = await client.textToSpeech.convert(finalVoiceId, {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
          style: options?.style ?? 0.0,
          use_speaker_boost: true
        }
      });

      // Convertir stream a Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      
      const audioBuffer = Buffer.concat(chunks);
      console.log(`✅ Audio generado: ${audioBuffer.length} bytes`);
      return audioBuffer;
      
    } catch (error) {
      console.error('❌ Error en ElevenLabs TTS:');
      if (error instanceof Error) {
        console.error('Mensaje:', error.message);
      }
      throw error;
    }
  }

  /**
   * Lista todas las voces disponibles
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await client.voices.getAll();
      return response.voices || [];
    } catch (error) {
      console.error('❌ Error obteniendo voces:', error);
      return [];
    }
  }

  /**
   * Cambia la voz por defecto
   */
  setDefaultVoice(voiceId: string): void {
    this.defaultVoiceId = voiceId;
    console.log(`🔊 Voz por defecto cambiada a: ${voiceId}`);
  }
}

export const elevenLabs = new ElevenLabsService();

// Prueba de conexión al iniciar
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    try {
      const voices = await elevenLabs.getVoices();
      console.log(`✅ ElevenLabs conectado - ${voices.length} voces disponibles`);
    } catch {
      console.warn('⚠️ ElevenLabs no responde - verifica API key');
    }
  })();
}
