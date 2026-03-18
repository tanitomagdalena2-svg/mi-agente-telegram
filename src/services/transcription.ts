import Groq from 'groq-sdk';
import axios from 'axios';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

export class TranscriptionService {
  /**
   * Transcribe audio desde un buffer usando Groq Whisper
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      console.log('🎤 Transcribiendo con Groq Whisper...');
      
      // Crear un File object a partir del buffer
      const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: 'whisper-large-v3',
        language: 'es',
        response_format: 'text'
      });

      console.log('✅ Transcripción exitosa:', transcription);
      return transcription;
    } catch (error) {
      console.error('❌ Error en transcripción con Groq:');
      if (error instanceof Error) {
        console.error('   - Mensaje:', error.message);
      }
      throw error;
    }
  }

  /**
   * Transcribe audio desde una URL de Telegram
   */
  async transcribeFromUrl(fileId: string, botToken: string): Promise<string> {
    try {
      // Obtener URL del archivo
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
      );
      
      const filePath = fileResponse.data.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      
      // Descargar audio
      const audioResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer'
      });
      
      const audioBuffer = Buffer.from(audioResponse.data);
      
      // Transcribir
      return await this.transcribeAudio(audioBuffer);
    } catch (error) {
      console.error('❌ Error en transcripción desde URL:', error);
      throw error;
    }
  }
}

export const transcriptionService = new TranscriptionService();
