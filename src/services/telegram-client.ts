import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export class TelegramClient {
  // Descargar archivo de voz de Telegram por file_id
  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      // 1. Obtener ruta del archivo
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
      );

      if (!fileResponse.data.ok) {
        throw new Error('No se pudo obtener información del archivo');
      }

      const filePath = fileResponse.data.result.file_path;

      // 2. Descargar archivo
      const downloadResponse = await axios.get(
        `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`,
        { responseType: 'arraybuffer' }
      );

      return Buffer.from(downloadResponse.data);
    } catch (error) {
      console.error('❌ Error descargando archivo de Telegram:', error);
      throw error;
    }
  }

  // Verificar si un mensaje contiene voz
  isVoiceMessage(ctx: any): boolean {
    return !!(ctx.message?.voice || ctx.message?.audio);
  }

  // Obtener file_id del mensaje de voz
  getFileId(ctx: any): string | null {
    if (ctx.message?.voice) {
      return ctx.message.voice.file_id;
    }
    if (ctx.message?.audio) {
      return ctx.message.audio.file_id;
    }
    return null;
  }
}

export const telegramClient = new TelegramClient();
