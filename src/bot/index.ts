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

// Middleware de autenticación y carga de historial
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId || !allowedUserIds.includes(parseInt(userId))) {
    console.log(`⛔ Acceso denegado para user ID: ${userId}`);
    await ctx.reply('⛔ No autorizado');
    return;
  }
  
  // Guardar userId en sesión
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

bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // Guardar mensaje del usuario en Supabase
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'user',
      content: message
    });

    // Obtener historial reciente del usuario (últimos 20 mensajes)
    const history = await memoryStore.getUserHistory(ctx.session.userId, 20);
    
    // Convertir historial al formato que espera Groq
    const groqMessages = history
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    // Llamar a Groq con el historial completo
    const groqResponse = await callGroq(groqMessages);

    // Guardar respuesta en Supabase
    await memoryStore.save({
      user_id: ctx.session.userId,
      session_id: ctx.session.sessionId,
      role: 'assistant',
      content: groqResponse
    });

    await ctx.reply(groqResponse);
    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq y memoria`);

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

bot.catch((err) => {
  console.error('❌ Error en bot:', err);
});

export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

export async function startBot() {
  console.log('🚀 Bot con IA (Groq) y memoria Supabase iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  
  // Limpiar registros antiguos una vez al día (opcional)
  setInterval(() => {
    memoryStore.cleanupOldEntries(30);
  }, 24 * 60 * 60 * 1000);
}
