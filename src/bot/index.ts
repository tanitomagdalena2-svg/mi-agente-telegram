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
      response_format: 'text'
    }) as unknown as string;

    console.log('✅ Transcripción exitosa');
    return transcription;
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
  console.log('\n' + '🔊'.repeat(20));
  console.log('🔊 INICIANDO PROCESAMIENTO DE AUDIO');
  console.log('🔊'.repeat(20));
  
  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  let transcribedText = '';

  try {
    // --- PASO 1: Obtener file_id ---
    console.log('📌 [PASO 1] Obteniendo file_id...');
    const fileId = telegramAudio.getFileId(ctx);
    if (!fileId) throw new Error('No se pudo obtener file_id');
    console.log('✅ file_id:', fileId);

    // --- PASO 2: Descargar audio ---
    console.log('📥 [PASO 2] Descargando audio de Telegram...');
    const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
    console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);

    // --- PASO 3: Transcribir con Groq ---
    console.log('🎯 [PASO 3] Transcribiendo con Groq Whisper...');
    transcribedText = await transcribeWithGroq(audioBuffer);
    console.log('📝 Transcripción:', transcribedText);

    // --- PASO 4: Guardar en memoria ---
    console.log('💾 [PASO 4] Guardando transcripción en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: `[AUDIO] ${transcribedText}`
    });

    // --- PASO 5: Obtener respuesta de Groq (IA) ---
    console.log('🧠 [PASO 5] Consultando a Groq (IA)...');
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);
    console.log('💬 Respuesta de IA:', groqResponse.substring(0, 100) + '...');

    // --- PASO 6: Guardar respuesta en memoria ---
    console.log('💾 [PASO 6] Guardando respuesta en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // --- PASO 7: INTENTAR GENERAR AUDIO (TTS) ---
    console.log('\n' + '🔊'.repeat(15));
    console.log('🔊 [PASO 7] INICIANDO GENERACIÓN DE AUDIO CON ELEVENLABS');
    console.log('🔊'.repeat(15));
    
    try {
      console.log('📢 Llamando a elevenLabs.synthesizeSpeech()...');
      const audioResponse = await elevenLabs.synthesizeSpeech(groqResponse);
      console.log(`✅ Audio generado: ${audioResponse.length} bytes`);

      console.log('📤 Enviando audio a Telegram...');
      await ctx.replyWithVoice(new InputFile(audioResponse));
      console.log('✅ RESPUESTA EN AUDIO ENVIADA');

    } catch (ttsError) {
      console.error('❌ ERROR EN GENERACIÓN DE AUDIO (TTS):');
      console.error('   - Tipo:', ttsError instanceof Error ? ttsError.constructor.name : typeof ttsError);
      console.error('   - Mensaje:', ttsError instanceof Error ? ttsError.message : String(ttsError));
      if (ttsError instanceof Error && ttsError.stack) {
        console.error('   - Stack:', ttsError.stack.split('\n')[1]);
      }

      // Fallback a texto
      console.log('⚠️ USANDO FALLBACK A TEXTO');
      const fallbackMessage = `🎤 *Transcripción:* ${transcribedText}\n\n💬 *Respuesta:* ${groqResponse}`;
      await ctx.reply(fallbackMessage, { parse_mode: 'Markdown' });
      console.log('✅ RESPUESTA EN TEXTO ENVIADA (FALLBACK)');
    }

    console.log('\n' + '✅'.repeat(20));
    console.log('✅ AUDIO PROCESADO COMPLETAMENTE');
    console.log('✅'.repeat(20) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO EN PROCESAMIENTO DE AUDIO:');
    console.error('   - Tipo:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('   - Mensaje:', error instanceof Error ? error.message : String(error));
    
    await ctx.reply(
      `❌ *Error procesando el audio*\n\n` +
      `Hubo un problema al procesar tu mensaje de voz. Por favor, intenta con texto.`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.catch((err) => {
  console.error('❌ Error global en bot:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000,
  onTimeout: 'return'
});

export async function startBot() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BOT INICIADO - MODO DIAGNÓSTICO');
  console.log('='.repeat(60));
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🎤 Transcripción: Groq Whisper');
  console.log('🔊 TTS: ElevenLabs (con logs detallados)');
  console.log('='.repeat(60) + '\n');
}
