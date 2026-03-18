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

// ===== 1. PRIMERO: Middleware de sesión =====
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// ===== 2. SEGUNDO: Middleware de autenticación =====
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
    console.log(`✅ Mensaje de texto #${ctx.session.messageCount} procesado con Groq`);

  } catch (error) {
    console.error('❌ Error procesando mensaje de texto:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// ===== 4. Manejador para mensajes de VOZ (CON LOGS DETALLADOS) =====
bot.on('message:voice', async (ctx) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎤 INICIANDO PROCESAMIENTO DE MENSAJE DE VOZ');
  console.log('='.repeat(60));
  
  ctx.session.messageCount++;
  console.log(`📊 Mensaje #${ctx.session.messageCount}`);

  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // PASO 1: Obtener file_id
    console.log('\n🔍 [PASO 1] Obteniendo file_id...');
    const fileId = telegramAudio.getFileId(ctx);
    if (!fileId) {
      console.error('❌ No se pudo obtener file_id');
      await ctx.reply('❌ No pude identificar el archivo de audio.');
      return;
    }
    console.log(`✅ File ID obtenido: ${fileId}`);

    // PASO 2: Descargar audio
    console.log('\n📥 [PASO 2] Descargando audio de Telegram...');
    const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
    console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);

    // PASO 3: Transcribir audio
    console.log('\n🎯 [PASO 3] Transcribiendo audio con ElevenLabs...');
    const transcribedText = await elevenLabs.transcribeFromBuffer(audioBuffer);
    console.log('📝 Texto transcrito:', transcribedText);

    // PASO 4: Guardar transcripción
    console.log('\n💾 [PASO 4] Guardando transcripción en memoria...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: `[AUDIO] ${transcribedText}`
    });

    // PASO 5: Obtener respuesta de Groq
    console.log('\n🧠 [PASO 5] Consultando a Groq...');
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);
    console.log('💬 Respuesta de Groq:', groqResponse);

    // PASO 6: Guardar respuesta
    console.log('\n💾 [PASO 6] Guardando respuesta en memoria...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // PASO 7: Generar audio
    console.log('\n🔊 [PASO 7] Generando audio con ElevenLabs...');
    const audioResponse = await elevenLabs.synthesizeSpeech(groqResponse);
    console.log(`✅ Audio generado: ${audioResponse.length} bytes`);

    // PASO 8: Enviar audio
    console.log('\n📤 [PASO 8] Enviando audio a Telegram...');
    await ctx.replyWithVoice(new InputFile(audioResponse));
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ MENSAJE DE VOZ #${ctx.session.messageCount} COMPLETADO EXITOSAMENTE`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ ERROR EN PROCESAMIENTO DE VOZ:');
    console.error('   - Tipo:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('   - Mensaje:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('   - Stack:', error.stack.split('\n')[0]);
    }
    await ctx.reply('❌ Lo siento, tuve un error procesando el mensaje de voz. Intenta con texto.');
  }
});

// ===== Manejador de errores global =====
bot.catch((err) => {
  console.error('\n❌ ERROR GLOBAL EN BOT:');
  console.error(err);
});

// ===== Exportar handler para webhook =====
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000,
  onTimeout: 'return'
});

// ===== Función de inicio =====
export async function startBot() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BOT INICIADO - CONFIGURACIÓN:');
  console.log('='.repeat(60));
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🎤 Soporte para mensajes de voz: ACTIVADO');
  console.log('🔊 ElevenLabs: CONFIGURADO');
  console.log('💾 Memoria Supabase: ACTIVADA');
  console.log('='.repeat(60) + '\n');
  
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
