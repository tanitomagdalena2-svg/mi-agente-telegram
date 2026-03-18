import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

// Nota: Necesitarás instalar fluent-ffmpeg y ffmpeg estático
// npm install fluent-ffmpeg @types/fluent-ffmpeg ffmpeg-static

export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const inputStream = new PassThrough();
    inputStream.end(audioBuffer);

    const outputChunks: Buffer[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk) => outputChunks.push(chunk));
    outputStream.on('end', () => resolve(Buffer.concat(outputChunks)));
    outputStream.on('error', reject);

    ffmpeg(inputStream)
      .toFormat('wav')
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .on('error', reject)
      .pipe(outputStream);
  });
}
