import { startBot } from './bot/index.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Iniciando Agente IA...');

// Verificar variables esenciales
const requiredVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_IDS'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Variable faltante: ${varName}`);
    process.exit(1);
  }
}

// Iniciar bot
startBot().catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});

// Mantener el proceso vivo
setInterval(() => {}, 1 << 30);