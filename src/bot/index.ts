import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { InputFile } from 'grammy';
import { callGroq } from '../llm/groq.js';
import { memoryStore } from '../memory/supabase.js';
import { elevenLabs } from '../services/elevenlabs.js';
import { telegramAudio } from '../services/telegramAudio.js';

interface SessionData {
  sessionId: string;
  messageCount: number;
  userId: string;
  preferredVoice?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

// ===== MIDDLEWARES =====
// 1. Sesión (DEBE IR PRIMERO)
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// 2. Autenticación (AHORA session existe)
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

// ===== COMANDOS =====
// Listar voces disponibles
bot.command('voices', async (ctx) => {
  try {
    const voices = await elevenLabs.getVoices();
    let message = '🎤 **Voces disponibles:**\n\n';
    voices.slice(0, 10).forEach((voice: any) => {
      message += `• **${voice.name}** (ID: \`${voice.voice_id}\`)\n`;
    });
    message += '\nUsa `/setvoice ID` para cambiar la voz.';
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error obteniendo voces:', error);
    await ctx.reply('❌ Error obteniendo voces');
  }
});

// Configurar voz preferida
bot.command('setvoice', async (ctx) => {
  const voiceId = ctx.message?.text?.split(' ')[1];
  if (!voiceId) {
    await ctx.reply('❌ Debes especificar un ID de voz.\nEj: `/setvoice Xb7hH8MSUJpSbSDYk0k2`');
    return;
  }
  ctx.session.preferredVoice = voiceId;
  await ctx.reply(`✅ Voz configurada a ID: ${voiceId}`);
});

// ===== MANEJADOR PRINCIPAL =====
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message && !telegramAudio.isVoiceMessage(ctx)) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  let userMessage = '';
  let isVoice = false;

  try {
    // ===== 1. OBTENER TEXTO DEL MENSAJE =====
    if (telegramAudio.isVoiceMessage(ctx)) {
      isVoice = true;
      console.log('\n🎤 ===== INICIANDO PROCESO DE VOZ =====');
      await ctx.api.sendChatAction(ctx.chat.id, 'record_voice');
      
      console.log('🎤 1. Detectado mensaje de voz');
      
      // Descargar archivo de voz
      const fileId = telegramAudio.getFileId(ctx);
      if (!fileId) throw new Error('No se pudo obtener file_id');
      console.log(`🎤 2. File ID obtenido: ${fileId}`);
      
      console.log('🎤 3. Descargando audio de Telegram...');
      const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
      console.log(`🎤 4. Audio descargado: ${audioBuffer.length} bytes`);
      
      // Transcribir con ElevenLabs
      console.log('🎤 5. Enviando a ElevenLabs para transcripción...');
      userMessage = await elevenLabs.transcribeAudio(audioBuffer);
      console.log(`🎤 6. Transcripción recibida: "${userMessage}"`);
      
      await ctx.reply(`📝 _Transcripción: ${userMessage}_`, { parse_mode: 'Markdown' });
      
    } else {
      // Mensaje de texto normal
      userMessage = message || '';
      if (!userMessage) return;
      console.log(`📝 Mensaje de texto: "${userMessage}"`);
    }

    // ===== 2. GUARDAR EN MEMORIA =====
    console.log('💾 Guardando mensaje en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: userMessage
    });

    // ===== 3. OBTENER HISTORIAL =====
    console.log('📚 Obteniendo historial de Supabase...');
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    console.log(`📚 Historial obtenido: ${history.length} mensajes`);

    // ===== 4. PREPARAR MENSAJES PARA GROQ =====
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content
      }));

    // ===== 5. LLAMAR A GROQ =====
    console.log('🤖 Llamando a Groq...');
    const groqResponse = await callGroq(groqMessages);
    console.log('🤖 Respuesta de Groq recibida');

    // ===== 6. GUARDAR RESPUESTA =====
    console.log('💾 Guardando respuesta en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // ===== 7. RESPONDER =====
    if (isVoice) {
      console.log('\n🔊 ===== INICIANDO GENERACIÓN DE VOZ =====');
      await ctx.api.sendChatAction(ctx.chat.id, 'upload_voice');
      
      try {
        console.log('🔊 1. Obteniendo voz preferida o por defecto...');
        const voiceId = ctx.session.preferredVoice || await elevenLabs.getDefaultVoice();
        console.log(`🔊 2. Usando voz ID: ${voiceId}`);
        
        console.log('🔊 3. Generando audio con ElevenLabs...');
        const audioBuffer = await elevenLabs.synthesizeSpeech(groqResponse, voiceId);
        console.log(`🔊 4. Audio generado: ${audioBuffer.length} bytes`);
        
        console.log('🔊 5. Enviando audio a Telegram...');
        await ctx.replyWithVoice(new InputFile(audioBuffer), {
          caption: `🎤 _Respuesta por voz_`
        });
        console.log('🔊 6. Audio enviado correctamente');
        
      } catch (audioError: any) {
        console.error('\n❌ ERROR DETALLADO EN GENERACIÓN DE VOZ:');
        console.error('Tipo:', audioError.name || 'Unknown');
        console.error('Mensaje:', audioError.message);
        console.error('Stack:', audioError.stack);
        console.error('Objeto completo:', JSON.stringify(audioError, null, 2));
        
        // Fallback a texto
        await ctx.reply(`${groqResponse}\n\n_[No se pudo generar audio: ${audioError.message}]_`);
      }
      
    } else {
      // Respuesta de texto normal
      await ctx.reply(groqResponse);
    }

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado completo`);

  } catch (error) {
    console.error('\n❌ ERROR GENERAL:');
    console.error(error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// Manejador de errores global
bot.catch((err) => {
  console.error('❌ Error GLOBAL en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000, // 60 segundos para audio
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq), Supabase y audio (ElevenLabs) iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  
  // Verificar ElevenLabs
  try {
    const voices = await elevenLabs.getVoices();
    console.log(`🎤 ElevenLabs conectado. ${voices.length} voces disponibles`);
    console.log(`🎤 Voz por defecto: ${await elevenLabs.getDefaultVoice()}`);
  } catch (error) {
    console.error('❌ Error conectando con ElevenLabs:', error);
  }

  // Limpieza automática cada 24 horas
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
