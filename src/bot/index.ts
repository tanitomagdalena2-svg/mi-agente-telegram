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

// --- Manejador de errores básico ---
bot.catch((err) => {
  console.error('❌ Error en el bot:', err);
});

// --- NO USAR bot.start() ---
// En su lugar, exportamos el manejador para webhook
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000, // 30 segundos de timeout
  onTimeout: 'return' // Devolver error 504 en timeout
});

// Función para configurar el webhook (se llama una vez al iniciar)
export async function setupWebhook() {
  try {
    // La URL del webhook es la URL de tu Space + /webhook
    const spaceId = process.env.SPACE_ID || 'Dinoch-Agente.hf.space';
    const webhookUrl = `https://${spaceId}/webhook`;
    
    console.log(`🔧 Configurando webhook en: ${webhookUrl}`);
    
    // Eliminar webhook anterior y configurar el nuevo
    await bot.api.deleteWebhook();
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ['message'],
      drop_pending_updates: true,
      max_connections: 10,
      secret_token: undefined // Opcional: podrías agregar un token secreto por seguridad
    });
    
    console.log('✅ Webhook configurado correctamente');
    
    // Verificar la configuración
    const webhookInfo = await bot.api.getWebhookInfo();
    console.log('📡 Información del webhook:', {
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
      last_error_date: webhookInfo.last_error_date 
        ? new Date(webhookInfo.last_error_date * 1000).toISOString() 
        : null,
      last_error_message: webhookInfo.last_error_message
    });
    
    return true;
  } catch (error) {
    console.error('❌ Error configurando webhook:', error);
    return false;
  }
}

// Función de inicio (se llama desde index.ts)
export async function startBot() {
  console.log('🚀 Iniciando configuración del bot...');
  
  // Verificar credenciales
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN no está definido');
    return;
  }
  
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  
  // Configurar webhook
  const webhookOk = await setupWebhook();
  
  if (webhookOk) {
    console.log('✅ Bot listo para recibir mensajes vía webhook');
  } else {
    console.error('❌ No se pudo configurar el webhook');
  }
  
  // Nota: NO iniciamos long polling, solo configuramos webhook
  // Las peticiones llegarán a través del endpoint /webhook
}