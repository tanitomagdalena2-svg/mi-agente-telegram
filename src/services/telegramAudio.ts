import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export class TelegramAudioService {
  async downloadVoiceFile(fileId: string): Promise<Buffer> {
    try {
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
      );
      if (!fileResponse.data.ok) throw new Error('No se pudo obtener información del archivo');

      const filePath = fileResponse.data.result.file_path;
      const downloadResponse = await axios.get(
        `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`,
        { responseType: 'arraybuffer' }
      );

      return Buffer.from(downloadResponse.data);
    } catch (error) {
      console.error('❌ Error descargando archivo:', error);
      throw error;
    }
  }

  isVoiceMessage(ctx: any): boolean {
    return !!(ctx.message?.voice || ctx.message?.audio);
  }

  getFileId(ctx: any): string | null {
    return ctx.message?.voice?.file_id || ctx.message?.audio?.file_id || null;
  }
}

export const telegramAudio = new TelegramAudioService();
