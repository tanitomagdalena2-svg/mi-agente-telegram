import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export class TelegramAudioService {
  // Descargar archivo de voz de Telegram
  async downloadVoiceFile(fileId: string): Promise<Buffer> {
    console.log(`📥 [1] Iniciando descarga de archivo: ${fileId}`);
    
    try {
      // 1. Obtener ruta del archivo
      console.log(`📥 [2] Solicitando información del archivo a Telegram...`);
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
      );

      if (!fileResponse.data.ok) {
        console.error(`❌ [ERROR] Telegram respondió con ok=false:`, fileResponse.data);
        throw new Error('No se pudo obtener información del archivo');
      }

      const filePath = fileResponse.data.result.file_path;
      console.log(`✅ [3] Archivo encontrado en path: ${filePath}`);

      // 2. Descargar archivo
      console.log(`📥 [4] Descargando archivo desde Telegram...`);
      const downloadResponse = await axios.get(
        `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`,
        { 
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      const buffer = Buffer.from(downloadResponse.data);
      console.log(`✅ [5] Archivo descargado: ${buffer.length} bytes`);
      
      return buffer;
    } catch (error) {
      console.error('❌ [ERROR] Error descargando archivo de Telegram:');
      if (axios.isAxiosError(error)) {
        console.error('   - Status:', error.response?.status);
        console.error('   - Data:', error.response?.data);
        console.error('   - Message:', error.message);
      } else {
        console.error('   - Error:', error);
      }
      throw error;
    }
  }

  // Verificar si un mensaje contiene voz
  isVoiceMessage(ctx: any): boolean {
    const hasVoice = !!(ctx.message?.voice || ctx.message?.audio);
    console.log(`🔍 Verificando si es mensaje de voz: ${hasVoice}`);
    return hasVoice;
  }

  // Obtener file_id del mensaje de voz
  getFileId(ctx: any): string | null {
    const fileId = ctx.message?.voice?.file_id || ctx.message?.audio?.file_id || null;
    console.log(`🔍 File ID obtenido: ${fileId || 'ninguno'}`);
    return fileId;
  }
}

export const telegramAudio = new TelegramAudioService();
