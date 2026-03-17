import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { InputFile } from 'grammy';
import { callGroq } from '../llm/groq.js';
import { memoryStore } from '../memory/supabase.js';
import { elevenLabs } from '../services/elevenlabs.js';
import { telegramAudio } from '../services/telegramAudio.js';
import { audioCache } from '../utils/audioCache.js';

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
// 1. Sesión
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// 2. Autenticación
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
    await ctx.reply('❌ Error obteniendo voces');
  }
});

// Configurar voz preferida
bot.command('setvoice', async (ctx) => {
  const voiceId = ctx.message?.text?.split(' ')[1];
  if (!voiceId) {
    await ctx.reply('❌ Debes especificar un ID de voz.\nEj: `/setvoice 21m00Tcm4TlvDq8ikWAM`');
    return;
  }
  ctx.session.preferredVoice = voiceId;
  await ctx.reply(`✅ Voz configurada a ID: ${voiceId}`);
});

// ===== MANEJADOR PRINCIPAL =====
bot.on('message', async (ctx) => {
  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  let userMessage = '';
  let isVoice = false;

  try {
    // ===== 1. OBTENER TEXTO DEL MENSAJE =====
    if (telegramAudio.isVoiceMessage(ctx)) {
      isVoice = true;
      await ctx.api.sendChatAction(ctx.chat.id, 'record_voice');
      
      console.log('🎤 Procesando mensaje de voz...');
      
      // Descargar archivo de voz
      const fileId = telegramAudio.getFileId(ctx);
      if (!fileId) throw new Error('No se pudo obtener file_id');
      
      const audioBuffer = await telegramAudio.downloadVoiceFile(fileId);
      
      // Transcribir con ElevenLabs
      userMessage = await elevenLabs.transcribeAudio(audioBuffer);
      console.log(`📝 Transcripción: "${userMessage}"`);
      
      await ctx.reply(`📝 _Transcripción: ${userMessage}_`, { parse_mode: 'Markdown' });
      
    } else {
      // Mensaje de texto normal
      userMessage = ctx.message?.text || '';
      if (!userMessage) return;
    }

    // ===== 2. GUARDAR EN MEMORIA =====
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: userMessage
    });

    // ===== 3. OBTENER HISTORIAL =====
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content
      }));

    // ===== 4. LLAMAR A GROQ =====
    console.log('🤖 Llamando a Groq...');
    const groqResponse = await callGroq(groqMessages);

    // ===== 5. GUARDAR RESPUESTA =====
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // ===== 6. RESPONDER =====
    if (isVoice) {
      // Si el usuario habló, responder con voz
      await ctx.api.sendChatAction(ctx.chat.id, 'upload_voice');
      
      try {
        // Obtener voz preferida o usar por defecto
        const voiceId = ctx.session.preferredVoice || await elevenLabs.getDefaultVoice();
        
        // Generar o obtener de cache
        const cacheKey = audioCache.getCacheKey(groqResponse, voiceId);
        let audioBuffer = audioCache.loadFromCache(cacheKey);
        
        if (!audioBuffer) {
          console.log('🎵 Generando audio con ElevenLabs...');
          audioBuffer = await elevenLabs.synthesizeSpeech(groqResponse, voiceId, {
            stability: 0.5,
            similarityBoost: 0.75
          });
          audioCache.saveToCache(cacheKey, audioBuffer);
        }
        
        // Enviar audio
        await ctx.replyWithVoice(new InputFile(audioBuffer), {
          caption: `🎤 _Respuesta por voz_`
        });
        
        console.log('✅ Audio enviado');
        
      } catch (audioError) {
        console.error('❌ Error generando audio:', audioError);
        // Fallback a texto
        await ctx.reply(`${groqResponse}\n\n_[No se pudo generar audio]_`);
      }
      
    } else {
      // Respuesta de texto normal
      await ctx.reply(groqResponse);
    }

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq${isVoice ? ' + voz' : ''}`);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

bot.catch((err) => {
  console.error('❌ Error GLOBAL en bot:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 60000, // Aumentamos timeout para audio
  onTimeout: 'return'
});

export async function startBot() {
  console.log('🚀 Bot con IA (Groq) y audio (ElevenLabs) iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  
  // Verificar ElevenLabs
  try {
    const voices = await elevenLabs.getVoices();
    console.log(`🎤 ElevenLAS conectado. ${voices.length} voces disponibles`);
  } catch (error) {
    console.error('❌ Error conectando con ElevenLabs:', error);
  }

  // Limpieza periódica
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
