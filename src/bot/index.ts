import { Bot, Context, session } from 'grammy';
import { MemoryStore } from '../memory/supabase.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Configuración del proxy
const proxyAgent = new HttpsProxyAgent('http://proxy-server:port'); // Necesitas un proxy real

// Inicializar bot con token y agente proxy
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN no está definido');

export const bot = new Bot<MyContext>(token, {
  client: {
    baseFetchConfig: {
      agent: proxyAgent,
      compress: true
    }
  }
});