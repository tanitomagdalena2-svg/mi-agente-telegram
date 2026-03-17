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

// ===== ORDEN CORRECTO =====
// 1. PRIMERO: Sesión
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// 2. SEGUNDO: Autenticación (AHORA session existe)
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
// ==========================

bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // 1. Guardar mensaje del usuario
    console.log('📝 Guardando mensaje en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: message
    });

    // 2. Obtener historial del usuario (últimos 20 mensajes)
    console.log('📚 Obteniendo historial de Supabase...');
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);

    // 3. Convertir historial para Groq
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content
      }));

    // 4. Llamar a Groq
    console.log('🤖 Llamando a Groq...');
    const groqResponse = await callGroq(groqMessages);

    // 5. Guardar respuesta
    console.log('📝 Guardando respuesta en Supabase...');
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    // 6. Responder al usuario
    await ctx.reply(groqResponse);

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq y Supabase`);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
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

  // Limpieza automática cada 24 horas
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
