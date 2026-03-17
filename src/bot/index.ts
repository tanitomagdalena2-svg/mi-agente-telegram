import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { callGroq } from '../llm/groq.js';
import { memoryStore } from '../memory/supabase.js';

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

bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // 1. Guardar mensaje del usuario en Supabase
    console.log('📝 Guardando mensaje del usuario en Supabase...');
    try {
      await memoryStore.save({
        user_id: ctx.session.userId,
        session_id: ctx.session.sessionId,
        role: 'user',
        content: message
      });
      console.log('✅ Mensaje de usuario guardado');
    } catch (dbError) {
      console.error('❌ Error GUARDANDO mensaje en Supabase:', dbError);
      // No interrumpimos el flujo, pero logueamos el error
    }

    // 2. Obtener historial reciente del usuario (últimos 20 mensajes)
    console.log('📚 Obteniendo historial de Supabase...');
    let history: any[] = [];
    try {
      history = await memoryStore.getUserHistory(ctx.session.userId, 20);
      console.log(`✅ Historial obtenido: ${history.length} mensajes`);
    } catch (historyError) {
      console.error('❌ Error obteniendo historial de Supabase:', historyError);
    }

    // 3. Convertir historial al formato que espera Groq
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content
      }));

    // 4. Llamar a Groq con el historial
    console.log('🤖 Llamando a Groq...');
    const groqResponse = await callGroq(groqMessages);
    console.log('✅ Respuesta de Groq recibida');

    // 5. Guardar respuesta en Supabase
    console.log('📝 Guardando respuesta de Groq en Supabase...');
    try {
      await memoryStore.save({
        user_id: ctx.session.userId,
        session_id: ctx.session.sessionId,
        role: 'assistant',
        content: groqResponse
      });
      console.log('✅ Respuesta guardada en Supabase');
    } catch (saveError) {
      console.error('❌ Error guardando respuesta en Supabase:', saveError);
    }

    // 6. Responder al usuario
    await ctx.reply(groqResponse);
    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado completamente`);

  } catch (error) {
    console.error('❌ Error GENERAL procesando mensaje:');
    console.error(error); // Esto mostrará el error completo
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

bot.catch((err) => {
  console.error('❌ Error GLOBAL en bot:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

export async function startBot() {
  console.log('🚀 Bot con IA (Groq) y memoria Supabase iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);

  // Limpiar registros antiguos una vez al día
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
