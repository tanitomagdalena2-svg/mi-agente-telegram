import { Bot, Context, session } from 'grammy';
import { MemoryStore } from '../memory/supabase.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Tipos para la sesión
interface SessionData {
  sessionId: string;
  messageCount: number;
}

type MyContext = Context & {
  session: SessionData;
};

// --- Configuración del Proxy ---
// Necesitas un proxy real. Aquí usamos variables de entorno por seguridad.
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
let proxyAgent = undefined;
if (proxyUrl) {
  try {
    proxyAgent = new HttpsProxyAgent(proxyUrl);
    console.log(`🔌 Proxy configurado: ${proxyUrl}`);
  } catch (error) {
    console.error('❌ Error al configurar el proxy:', error.message);
  }
} else {
  console.warn('⚠️  No se encontró variable de proxy (HTTP_PROXY/HTTPS_PROXY). Conectando directamente.');
}
// ---------------------------------

// Inicializar bot con token desde secrets
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN no está definido');

// Configurar el cliente del bot con el agente proxy (si existe)
export const bot = new Bot<MyContext>(token, {
  client: {
    baseFetchConfig: {
      agent: proxyAgent,         // <-- Aquí se usa el proxy
      compress: true,
    },
  },
});

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

  await ctx.reply(`✅ Bot funcionando. Mensaje #${ctx.session.messageCount} recibido: "${message}"`);
});

// --- Función para iniciar el bot ---
export async function startBot() {
  try {
    await bot.start({
      onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} iniciado correctamente`);
        console.log(`📊 Usuarios permitidos: ${allowedUserIds.join(', ')}`);
        if (proxyAgent) {
          console.log(`🔒 Conectando a través de proxy.`);
        } else {
          console.log(`🌐 Conectando directamente (sin proxy).`);
        }
      },
      // Configuración adicional para long polling
      timeout: 30, // segundos
      drop_pending_updates: true,
      allowed_updates: ['message'],
    });
  } catch (error) {
    console.error('💥 Error al iniciar el bot:', error);
    // No terminamos el proceso, solo registramos el error.
    // El setInterval de index.ts mantendrá vivo el proceso.
  }
}