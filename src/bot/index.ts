import { Bot, Context, session, webhookCallback } from 'grammy';
import { MemoryStore } from '../memory/supabase.js';

// Tipos para la sesión
interface SessionData {
  sessionId: string;
  messageCount: number;
}

type MyContext = Context & {
  session: SessionData;
};

// Inicializar bot con token desde secrets
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token);

// Lista de usuarios permitidos (desde secrets)
const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];

// --- Middleware de autenticación ---
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

// --- Middleware de sesión ---
bot.use(session({
  initial: () => ({
    sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    messageCount: 0,
  }),
}));

// --- Manejador de mensajes simple (por ahora) ---
bot.on('message', async (ctx) => {
  const message = ctx.message.text;
  if (!message) return;

  ctx.session.messageCount++;

  console.log(`📩 Mensaje de ${ctx.from?.id}: ${message}`);
  console.log(`🆔 Session ID: ${ctx.session.sessionId}`);
  console.log(`📊 Mensaje #${ctx.session.messageCount} en esta sesión`);

  await ctx.reply(`✅ Bot funcionando. Mensaje #${ctx.session.messageCount} recibido: "${message}"`);
});

// --- Manejador de errores ---
bot.catch((err) => {
  console.error('❌ Error en el bot:', err);
});

// --- Exportar el manejador para webhook ---
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000,
  onTimeout: 'return'
});

// --- FUNCIÓN SIMPLIFICADA: No intenta conectar con Telegram ---
export async function setupWebhook() {
  console.log('🔧 Configuración MANUAL requerida - ejecuta este comando en tu navegador:');
  console.log(`https://api.telegram.org/bot${token}/setWebhook?url=https://Dinoch-Agente.hf.space/webhook`);
  console.log('📝 Luego verifica con:');
  console.log(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  return true;
}

// --- Función de inicio simplificada ---
export async function startBot() {
  console.log('🚀 Bot iniciado en MODO PASIVO (esperando webhooks de Telegram)');
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🌐 URL de tu Space: https://Dinoch-Agente.hf.space');
  console.log('🔗 Endpoint webhook: https://Dinoch-Agente.hf.space/webhook');
  console.log('');
  console.log('⚠️  IMPORTANTE: Debes configurar el webhook MANUALMENTE:');
  console.log('   1. Abre esta URL en tu navegador:');
  console.log(`   https://api.telegram.org/bot${token}/setWebhook?url=https://Dinoch-Agente.hf.space/webhook`);
  console.log('   2. Verifica con:');
  console.log(`   https://api.telegram.org/bot${token}/getWebhookInfo`);
  console.log('');
  console.log('✅ Bot listo para recibir mensajes cuando el webhook esté configurado');
}