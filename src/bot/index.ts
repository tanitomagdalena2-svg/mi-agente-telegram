import { Bot, Context, session } from 'grammy';
import { MemoryStore } from '../memory/supabase.js';

// Tipos para la sesión
interface SessionData {
  sessionId: string;
  messageCount: number;
}

type MyContext = Context & {
  session: SessionData;
};

// Inicializar bot con token de secrets
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

// Lista de usuarios permitidos (desde secrets)
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

// Middleware de autenticación
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('❌ No se pudo identificar al usuario');
    return;
  }
  
  if (!allowedUserIds.includes(userId)) {
    await ctx.reply('⛔ No autorizado. Este es un bot privado.');
    console.log(`Intento de acceso no autorizado de user ID: ${userId}`);
    return;
  }
  
  await next();
});

// Middleware de sesión
bot.use(session({
  initial: () => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0
  })
}));

// Manejador de mensajes simple (por ahora)
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;
  
  console.log(`Mensaje de ${ctx.from?.id}: ${message}`);
  console.log(`Session ID: ${ctx.session.sessionId}`);
  
  await ctx.reply(`✅ Bot funcionando. Mensaje #${ctx.session.messageCount} recibido: "${message}"`);
});

// Función para iniciar el bot
export async function startBot() {
  try {
    await bot.start({
      onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} iniciado correctamente`);
        console.log(`📊 Usuarios permitidos: ${allowedUserIds.join(', ')}`);
      }
    });
  } catch (error) {
    console.error('Error al iniciar el bot:', error);
    throw error;
  }
}