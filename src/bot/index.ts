import { Bot, Context, session, SessionFlavor, webhookCallback, InputFile } from 'grammy';
import { callGroq } from '../llm/groq.js';
import { memoryStore } from '../memory/supabase.js';
import { telegramAudio } from '../services/telegramAudio.js';
import { elevenLabs } from '../services/elevenlabs.js';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

interface SessionData {
  sessionId: string;
  messageCount: number;
  userId: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId || !allowedUserIds.includes(parseInt(userId))) {
    console.log(`⛔ Acceso denegado para user ID: ${userId}`);
    await ctx.reply('⛔ No autorizado');
    return;
  }
  ctx.session.userId = userId;
  await next();
});

async function transcribeWithGroq(audioBuffer: Buffer): Promise<string> {
  const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.ogg`);

  try {
    console.log('🎤 Transcribiendo con Groq Whisper...');
    await fs.promises.writeFile(tempFilePath, audioBuffer);
    const fileStream = fs.createReadStream(tempFilePath);

    const transcription = await groqClient.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-large-v3',
      language: 'es',
      response_format: 'text' // Esto asegura que la respuesta sea string
    });

    console.log('✅ Transcripción exitosa');
    return transcription; // transcription ya es un string
  } catch (error) {
    console.error('❌ Error en transcripción con Groq:',
      error instanceof Error ? error.message : error);
    throw error;
  } finally {
    try { await fs.promises.unlink(tempFilePath); } catch { /* ignorar */ }
  }
}

// ===== Manejador para mensajes de TEXTO =====
bot.on('message:text', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: message
    });

    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);

    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    await ctx.reply(groqResponse);
    console.log(`✅ Mensaje de texto #${ctx.session.messageCount} procesado`);
  } catch (error) {
    console.error('❌ Error en texto:', error);
    await ctx.reply('❌ Error interno. Intenta de nuevo.');
  }
});

// ===== Manejador para mensajes de VOZ =====
bot.on('message:voice', async (ctx) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎤 INICIANDO PROCESAMIENTO DE AUDIO');
  console.log('='.repeat(60));

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  let transcribedText = '';

  try {
    const fileId = telegramAudio.getFileId(ctx);
    if (!fileId) throw new Error('No se pudo obtener file_id');

    console.log(`📥 Descargando audio...`);
    const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
    console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);

    // Llamada a la función que retorna string
    transcribedText = await transcribeWithGroq(audioBuffer);
    console.log(`📝 Transcripción: "${transcribedText}"`);

    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: `[AUDIO] ${transcribedText}`
    });

    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);

    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // Intentar responder con audio (fallback a texto)
    try {
      console.log(`🔊 Generando audio...`);
      const audioResponse = await elevenLabs.synthesizeSpeech(groqResponse);
      await ctx.replyWithVoice(new InputFile(audioResponse));
      console.log(`✅ Respuesta en audio`);
    } catch (ttsError) {
      console.log(`⚠️ Usando fallback a texto (error TTS)`);
      await ctx.reply(`🎤 *Transcripción:* ${transcribedText}\n\n💬 *Respuesta:* ${groqResponse}`,
        { parse_mode: 'Markdown' });
    }

    console.log(`🎤 Audio procesado`);

  } catch (error) {
    console.error(`❌ Error:`, error);
    await ctx.reply(
      `❌ *Error procesando audio*\n\nNo pude procesar el audio.`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.catch((err) => {
  console.error('❌ Error global:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000,
  onTimeout: 'return'
});

export async function startBot() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BOT CON GROQ WHISPER (FINAL)');
  console.log('='.repeat(60));
  console.log('📊 Usuarios:', allowedUserIds);
  console.log('='.repeat(60) + '\n');
}
