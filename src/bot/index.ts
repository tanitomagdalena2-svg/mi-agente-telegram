import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { callGroq } from '../llm/groq.js';

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

// ===== ORDEN CORRECTO DE MIDDLEWARES =====
// 1. PRIMERO: Middleware de sesión (inicializa session)
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    userId: ''
  })
}));

// 2. SEGUNDO: Middleware de autenticación (usa session, que ya existe)
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
// =========================================

// Manejador de mensajes
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // Llamar a Groq con el mensaje actual
    const groqResponse = await callGroq([{ role: 'user', content: message }]);

    // Responder al usuario
    await ctx.reply(groqResponse);

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq (sin memoria)`);
    console.log(`👤 Usuario: ${ctx.session.userId}, Sesión: ${ctx.session.sessionId}`);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// Manejador de errores global
bot.catch((err) => {
  console.error('❌ Error GLOBAL en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq) iniciado (versión estable)');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
}
