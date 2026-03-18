import axios from 'axios';
import FormData from 'form-data';
import { ElevenLabsClient } from 'elevenlabs';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('❌ FALTA ELEVENLABS_API_KEY en variables de entorno');
}

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsService {
  private apiKey: string;
  private defaultVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel - voz estándar que siempre funciona
  private client: ElevenLabsClient;

  constructor() {
    this.apiKey = ELEVENLABS_API_KEY || '';
    this.client = new ElevenLabsClient({ apiKey: this.apiKey });
    
    // Log para verificar que la API key se cargó
    console.log('🔑 ElevenLAS API Key configurada (primeros 5 chars):', this.apiKey.substring(0, 5) + '...');
    
    // Verificar la voz por defecto al iniciar
    this.testVoice(this.defaultVoiceId);
  }

  /**
   * Verifica si una voz específica está disponible
   */
  async testVoice(voiceId: string): Promise<boolean> {
    try {
      const response = await axios.get(`${BASE_URL}/voices/${voiceId}`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      console.log(`✅ Voz "${response.data.name}" (${voiceId}) está disponible`);
      return true;
    } catch (error) {
      console.error(`❌ Voz ${voiceId} NO disponible:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Obtiene la voz por defecto
   */
  async getDefaultVoice(): Promise<string> {
    return this.defaultVoiceId;
  }

  /**
   * Transcribe audio desde Buffer usando ElevenLabs STT
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
   * Transcribe audio a texto usando ElevenLabs STT (implementación con Axios)
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
        console.error('   - Status:', error.response.status);
        console.error('   - Detalles:', error.response.data);
      }
      return "[No se pudo transcribir el audio]";
    }
  }

  /**
   * Sintetiza voz a partir de texto usando la librería oficial de ElevenLabs
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
      console.log(`🔊 Generando voz con ElevenLabs - Voz: ${finalVoiceId}`);
      
      // Verificar que la voz existe antes de intentar generar
      const voiceAvailable = await this.testVoice(finalVoiceId);
      if (!voiceAvailable) {
        throw new Error(`La voz ${finalVoiceId} no está disponible`);
      }

      const audioStream = await this.client.textToSpeech.convert(finalVoiceId, {
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
        console.error('   - Mensaje:', error.message);
      }
      throw error;
    }
  }

  /**
   * Lista todas las voces disponibles en tu cuenta
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await this.client.voices.getAll();
      console.log(`✅ ${response.voices.length} voces disponibles`);
      
      // Mostrar las primeras 5 voces con sus IDs
      response.voices.slice(0, 5).forEach(v => {
        console.log(`   - ${v.name}: ${v.voice_id}`);
      });
      
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
    this.testVoice(voiceId); // Verificar que la nueva voz funciona
  }

  /**
   * Verifica la conexión con ElevenLabs
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

// Exportar instancia única
export const elevenLabs = new ElevenLabsService();

// Prueba de conexión al iniciar (no bloqueante)
if (process.env.NODE_ENV !== 'production') {
  elevenLabs.testConnection().then(ok => {
    if (ok) {
      console.log('✅ Conexión con ElevenLabs exitosa');
    } else {
      console.warn('⚠️ No se pudo conectar con ElevenLabs');
    }
  });
}
