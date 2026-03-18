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

  /**
   * Obtiene la voz por defecto
   */
  async getDefaultVoice(): Promise<string> {
    return this.defaultVoiceId;
  }

  /**
   * Transcribe audio a texto usando ElevenLabs STT
   * @param audioBuffer Buffer del archivo de audio
   * @returns Texto transcrito
   */
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

  /**
   * Transcribe audio desde una URL (útil para Telegram)
   * @param audioUrl URL pública del archivo de audio
   * @returns Texto transcrito
   */
  async transcribeFromUrl(audioUrl: string): Promise<string> {
    try {
      console.log('📥 Descargando audio desde:', audioUrl);
      
      // Descargar el audio
      const response = await axios.get(audioUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)'
        }
      });
      
      const audioBuffer = Buffer.from(response.data);
      console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);
      
      // Usar el método de transcripción
      return await this.transcribeAudio(audioBuffer);
    } catch (error) {
      console.error('❌ Error descargando/transcribiendo audio:', error);
      return "[Error al procesar el audio]";
    }
  }

  /**
   * Sintetiza voz a partir de texto
   * @param text Texto a convertir en voz
   * @param voiceId ID de la voz (opcional)
   * @param options Configuración de voz (estabilidad, similitud, estilo)
   * @returns Buffer con el audio MP3
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
          responseType: 'arraybuffer',
          timeout: 60000 // 60 segundos para audios largos
        }
      );

      console.log(`✅ Audio generado: ${response.data.length} bytes`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('❌ Error en ElevenLabs TTS:');
      if (axios.isAxiosError(error) && error.response) {
        console.error('Código:', error.response.status);
        console.error('Detalles:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Obtiene lista de voces disponibles
   * @returns Array de voces
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await axios.get(`${BASE_URL}/voices`, {
        headers: { 'xi-api-key': this.apiKey },
        timeout: 10000
      });
      return response.data.voices || [];
    } catch (error) {
      console.error('❌ Error obteniendo voces:', error);
      return [];
    }
  }

  /**
   * Cambia la voz por defecto
   * @param voiceId Nuevo ID de voz
   */
  setDefaultVoice(voiceId: string): void {
    this.defaultVoiceId = voiceId;
    console.log(`🔊 Voz por defecto cambiada a: ${voiceId}`);
  }

  /**
   * Verifica si la API key es válida
   * @returns true si es válida
   */
  async testConnection(): Promise<boolean> {
    try {
      const voices = await this.getVoices();
      return voices.length > 0;
    } catch {
      return false;
    }
  }
}

// Exportar instancia única para toda la app
export const elevenLabs = new ElevenLabsService();

// Prueba de conexión al iniciar (opcional)
if (process.env.NODE_ENV !== 'production') {
  elevenLabs.testConnection().then(ok => {
    if (ok) {
      console.log('✅ ElevenLabs conectado correctamente');
    } else {
      console.warn('⚠️ ElevenLabs no responde - verifica API key');
    }
  });
}
