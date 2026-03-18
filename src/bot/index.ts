import { Bot, Context, session, SessionFlavor, webhookCallback, InputFile } from 'grammy';
import { callGroq } from '../llm/groq.js';
import { memoryStore } from '../memory/supabase.js';
import { telegramAudio } from '../services/telegramAudio.js';
import { elevenLabs } from '../services/elevenlabs.js';

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

// ===== 1. Middleware de sesión =====
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// ===== 2. Middleware de autenticación =====
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

// ===== 3. Manejador para mensajes de TEXTO =====
bot.on('message:text', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // Guardar mensaje del usuario
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: message
    });

    // Obtener historial y respuesta de Groq
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);

    // Guardar respuesta
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

// ===== 4. Manejador para mensajes de VOZ (CON FALLBACK A TEXTO) =====
bot.on('message:voice', async (ctx) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎤 INICIANDO PROCESAMIENTO DE AUDIO');
  console.log('='.repeat(60));
  
  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  let transcribedText = '';
  let usingFallback = false;

  try {
    // --- PASO 1: Obtener y descargar audio ---
    const fileId = telegramAudio.getFileId(ctx);
    if (!fileId) {
      throw new Error('No se pudo obtener file_id');
    }
    console.log(`📥 Descargando audio...`);
    const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
    console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);

    // --- PASO 2: Transcribir audio (intento principal) ---
    try {
      console.log(`🎯 Transcribiendo con ElevenLabs...`);
      transcribedText = await elevenLabs.transcribeFromBuffer(audioBuffer);
      console.log(`📝 Transcripción exitosa: "${transcribedText}"`);
    } catch (sttError) {
      console.error(`❌ Error en transcripción:`, sttError);
      transcribedText = "[El audio no pudo ser transcrito. Por favor, envía tu consulta por texto.]";
      usingFallback = true;
    }

    // --- PASO 3: Guardar transcripción en memoria (siempre en texto) ---
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: `[AUDIO: ${transcribedText}]`
    });

    // --- PASO 4: Obtener respuesta de Groq ---
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);
    console.log(`💬 Respuesta de Groq: "${groqResponse.substring(0, 50)}..."`);

    // Guardar respuesta
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // --- PASO 5: Intentar responder con audio (fallback a texto) ---
    try {
      console.log(`🔊 Generando audio de respuesta...`);
      const audioResponse = await elevenLabs.synthesizeSpeech(groqResponse);
      await ctx.replyWithVoice(new InputFile(audioResponse));
      console.log(`✅ Respuesta enviada en audio`);
    } catch (ttsError) {
      console.error(`❌ Error generando audio:`, ttsError);
      
      // Fallback: responder con texto + aviso
      const fallbackMessage = usingFallback 
        ? `⚠️ *Nota:* Tu audio no pudo ser transcrito, pero respondo a tu consulta:\n\n${groqResponse}`
        : `⚠️ *Nota:* No pude generar audio, pero aquí va mi respuesta:\n\n${groqResponse}`;
      
      await ctx.reply(fallbackMessage, { parse_mode: 'Markdown' });
      console.log(`✅ Respuesta enviada en texto (fallback)`);
    }

    console.log(`🎤 Procesamiento de audio completado`);

  } catch (error) {
    console.error(`❌ Error crítico en audio:`, error);
    
    // Error general: responder con texto amigable
    await ctx.reply(
      `❌ *Error procesando el audio*\n\n` +
      `Hubo un problema al procesar tu mensaje de voz. ` +
      `Por favor, intenta enviar tu consulta por texto.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ===== Manejador de errores global =====
bot.catch((err) => {
  console.error('❌ Error global:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000,
  onTimeout: 'return'
});

export async function startBot() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BOT INICIADO - MODO AUDIO CON FALLBACK');
  console.log('='.repeat(60));
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🎤 Audio → Texto → IA → Audio (con fallback a texto)');
  console.log('='.repeat(60) + '\n');
}
