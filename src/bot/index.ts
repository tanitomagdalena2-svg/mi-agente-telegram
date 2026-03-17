import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { callGroq } from '../llm/groq';

interface SessionData {
  sessionId: string;
  messageCount: number;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

// Middleware de autenticación
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !allowedUserIds.includes(userId)) {
    console.log(`⛔ Acceso denegado para user ID: ${userId}`);
    await ctx.reply('⛔ No autorizado');
    return;
  }
  await next();
});

// Middleware de sesión
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    conversationHistory: []
  })
}));

// Manejador de mensajes con IA
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    ctx.session.conversationHistory.push({ role: 'user', content: message });

    const groqResponse = await callGroq(ctx.session.conversationHistory);

    ctx.session.conversationHistory.push({ role: 'assistant', content: groqResponse });

    if (ctx.session.conversationHistory.length > 20) {
      ctx.session.conversationHistory = ctx.session.conversationHistory.slice(-20);
    }

    await ctx.reply(groqResponse);

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq`);
  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

bot.catch((err) => {
  console.error('❌ Error en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq) iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
                                              }    // Responder
    await ctx.reply(groqResponse);

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq`);

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// Manejador de errores
bot.catch((err) => {
  console.error('❌ Error en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq) iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
}    await ctx.reply(groqResponse);

    console.log(`✅ Mensaje #${ctx.session.messageCount} procesado con Groq`);

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await ctx.reply('❌ Lo siento, tuve un error interno. Intenta de nuevo.');
  }
});

// Manejador de errores
bot.catch((err) => {
  console.error('❌ Error en bot:', err);
});

// Exportar handler para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

// Función de inicio
export async function startBot() {
  console.log('🚀 Bot con IA (Groq) iniciado');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
}
