import { Bot, Context, webhookCallback } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot(token);

// Lista de usuarios permitidos
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

// Middleware de autenticación simple
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !allowedUserIds.includes(userId)) {
    console.log(`⛔ Acceso denegado para user ID: ${userId}`);
    await ctx.reply('⛔ No autorizado');
    return;
  }
  await next();
});

// Manejador SUPER SIMPLE para probar
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  console.log(`📩 Procesando mensaje: "${message}"`);
  
  // Responder inmediatamente
  await ctx.reply(`✅ Eco: ${message}`);
  
  console.log('✅ Respuesta enviada correctamente');
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

// Funciones de inicio (simplificadas)
export async function startBot() {
  console.log('🚀 Bot en modo pasivo (webhooks)');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
}