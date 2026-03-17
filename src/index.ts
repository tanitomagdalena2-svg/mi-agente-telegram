import { startBot } from './bot/index.js';
import { handleWebhook } from './webhook.js';
import { createServer } from 'http';
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

// Agregar SPACE_ID a las variables requeridas para webhook
if (!process.env.SPACE_ID) {
  console.warn('⚠️ SPACE_ID no definido, usando Dinoch-Agente.hf.space');
  process.env.SPACE_ID = 'Dinoch-Agente.hf.space';
}

// Iniciar configuración del bot
startBot().catch(error => {
  console.error('💥 Error fatal en startBot:', error);
});

// Crear servidor HTTP para recibir webhooks
const server = createServer(async (req, res) => {
  // Solo procesar POST a /webhook
  if (req.url === '/webhook' && req.method === 'POST') {
    // Convertir request de Node a Fetch API Request
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: req
    });
    
    const response = await handleWebhook(request);
    
    // Enviar respuesta
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const text = await response.text();
    res.end(text);
  } else {
    // Para cualquier otra ruta, responder con 404
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Puerto que usa Hugging Face (7860)
const PORT = 7860;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor webhook escuchando en puerto ${PORT}`);
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('👋 Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});