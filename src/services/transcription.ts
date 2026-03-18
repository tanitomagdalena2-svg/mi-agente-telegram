import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

export async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    // Descargar el archivo de audio de Telegram
    const response = await fetch(audioUrl);
    const audioBuffer = await response.arrayBuffer();

    // Crear un File object para Groq
    const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

    // Transcribir con Groq
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3',
      language: 'es',
      response_format: 'text'
    });

    return transcription;
  } catch (error) {
    console.error('Error transcribiendo audio:', error);
    throw error;
  }
}
