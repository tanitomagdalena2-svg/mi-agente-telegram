import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
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

// Middleware de autenticación
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

// Middleware de sesión
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// Manejador para mensajes de TEXTO
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

    // Obtener historial
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    // Llamar a Groq
    const groqResponse = await callGroq(groqMessages);

    // Guardar respuesta
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // Responder
    await ctx.reply(groqResponse);
    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq`);

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// Manejador para mensajes de VOZ
bot.on('message:voice', async (ctx) => {
  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // 1. Obtener file_id del mensaje de voz
    const fileId = telegramAudio.getFileId(ctx);
    if (!fileId) {
      await ctx.reply('❌ No pude identificar el archivo de audio.');
      return;
    }

    console.log(`🎵 Procesando mensaje de voz #${ctx.session.messageCount}`);

    // 2. Descargar audio usando telegramAudio
    const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
    console.log(`✅ Audio descargado: ${audioBuffer.length} bytes`);

    // 3. Transcribir audio usando ElevenLabs
    const transcribedText = await elevenLabs.transcribeFromBuffer(audioBuffer);
    console.log('📝 Texto transcrito:', transcribedText);

    // 4. Guardar transcripción en memoria
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: `[AUDIO] ${transcribedText}`
    });

    // 5. Obtener historial y respuesta de Groq
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }));

    const groqResponse = await callGroq(groqMessages);

    // 6. Guardar respuesta en memoria
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // 7. Generar audio con ElevenLabs
    console.log('🔊 Generando audio de respuesta...');
    const audioResponse = await elevenLabs.synthesizeSpeech(groqResponse);

    // 8. Enviar audio
    await ctx.replyWithVoice(audioResponse);
    
    console.log(`✅ Mensaje de voz #${ctx.session.messageCount} procesado completamente`);

  } catch (error) {
    console.error('❌ Error procesando mensaje de voz:', error);
    await ctx.reply('❌ Lo siento, tuve un error procesando el mensaje de voz. Intenta con texto.');
  }
});

// Manejador de errores global
bot.catch((err) => {
  console.error('❌ Error en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000, // Aumentado para audio
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq), voz y memoria iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🎤 Soporte para mensajes de voz activado');
  
  // Limpiar registros antiguos una vez al día
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
