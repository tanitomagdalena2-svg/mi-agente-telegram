import { Bot, Context, session, SessionFlavor, webhookCallback } from 'grammy';
import { callGroq } from '../llm/groq';

// Definir la estructura de la sesión de forma explícita
interface SessionData {
  sessionId: string;
  messageCount: number;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Crear el tipo de contexto combinado
type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

// Lista de usuarios permitidos
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

// Middleware de sesión - con tipo explícito en el valor inicial
bot.use(session({
  initial: (): SessionData => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
    conversationHistory: [] // Ahora TypeScript sabe que es Array<{...}>
  })
}));

// Manejador de mensajes con IA
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  // Ahora ctx.session está correctamente tipado
  ctx.session.messageCount++;
  
  // Mostrar que está pensando
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    // Agregar mensaje del usuario al historial
    ctx.session.conversationHistory.push({ role: 'user', content: message });

    // Llamar a Groq
    const groqResponse = await callGroq(ctx.session.conversationHistory);

    // Agregar respuesta al historial
    ctx.session.conversationHistory.push({ role: 'assistant', content: groqResponse });

    // Limitar historial a últimos 20 mensajes
    if (ctx.session.conversationHistory.length > 20) {
      ctx.session.conversationHistory = ctx.session.conversationHistory.slice(-20);
    }

    // Responder
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
