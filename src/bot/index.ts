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

// --- Exportar el manejador para webhook (usando MY_SPACE_ID) ---
export const webhookHandler = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 30000, // 30 segundos de timeout
  onTimeout: 'return' // Devolver error 504 en timeout
});

// Función para configurar el webhook (se llama una vez al iniciar)
export async function setupWebhook() {
  try {
    // Usar MY_SPACE_ID en lugar de SPACE_ID (que está reservado)
    const spaceId = process.env.MY_SPACE_ID || 'Dinoch-Agente.hf.space';
    const webhookUrl = `https://${spaceId}/webhook`;
    
    console.log(`🔧 Configurando webhook en: ${webhookUrl}`);
    
    // Verificar que tenemos token
    if (!token) {
      throw new Error('Token no disponible');
    }

    // Obtener información del bot antes de configurar
    const botInfo = await bot.api.getMe();
    console.log(`🤖 Bot info: @${botInfo.username} (ID: ${botInfo.id})`);

    // Eliminar webhook anterior
    console.log('🗑️ Eliminando webhook anterior...');
    await bot.api.deleteWebhook();
    
    // Configurar nuevo webhook
    console.log('⚙️ Configurando nuevo webhook...');
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ['message'], // Solo recibir mensajes
      drop_pending_updates: true,   // Ignorar mensajes viejos
      max_connections: 10,          // Conexiones simultáneas
      secret_token: undefined       // Opcional: podrías agregar un token por seguridad
    });
    
    console.log('✅ Webhook configurado correctamente');
    
    // Verificar la configuración
    const webhookInfo = await bot.api.getWebhookInfo();
    console.log('📡 Información del webhook:');
    console.log(`   URL: ${webhookInfo.url}`);
    console.log(`   Pendientes: ${webhookInfo.pending_update_count}`);
    console.log(`   IP: ${webhookInfo.ip_address || 'No especificada'}`);
    
    if (webhookInfo.last_error_date) {
      console.log(`   ⚠️ Último error: ${new Date(webhookInfo.last_error_date * 1000).toISOString()}`);
      console.log(`   Mensaje: ${webhookInfo.last_error_message}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error configurando webhook:', error);
    if (error instanceof Error) {
      console.error('   Detalles:', error.message);
      console.error('   Stack:', error.stack);
    }
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
  
  // Mostrar configuración
  console.log('📊 Usuarios permitidos:', allowedUserIds);
  console.log('🔑 Token presente (primeros 5 chars):', token.substring(0, 5) + '...');
  
  // Configurar webhook
  const webhookOk = await setupWebhook();
  
  if (webhookOk) {
    console.log('✅ Bot listo para recibir mensajes vía webhook');
  } else {
    console.error('❌ No se pudo configurar el webhook');
    console.log('🔄 Intentando reconectar en 5 segundos...');
    
    // Reintentar después de 5 segundos
    setTimeout(async () => {
      console.log('🔄 Reintentando configuración de webhook...');
      const retryOk = await setupWebhook();
      if (retryOk) {
        console.log('✅ Webhook configurado en el reintento');
      } else {
        console.error('❌ Falló el reintento');
      }
    }, 5000);
  }
  
  // Nota: NO iniciamos long polling, solo configuramos webhook
  // Las peticiones llegarán a través del endpoint /webhook
}