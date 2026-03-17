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

// Usar MY_SPACE_ID en lugar de SPACE_ID (que está reservado)
const spaceId = process.env.MY_SPACE_ID || 'Dinoch-Agente.hf.space';
console.log(`🌐 Space ID configurado: ${spaceId}`);

// Guardar en process.env para que otros módulos puedan usarlo
process.env.MY_SPACE_ID = spaceId;

// Iniciar configuración del bot (solo muestra instrucciones, no intenta conectar)
startBot().catch(error => {
  console.error('💥 Error fatal en startBot:', error);
});

// PUERTO - MODIFICADO PARA USAR VARIABLE DE ENTORNO
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7860;

// Crear servidor HTTP para recibir webhooks
const server = createServer(async (req, res) => {
  // Configurar CORS headers básicos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Solo procesar POST a /webhook
  if (req.url === '/webhook' && req.method === 'POST') {
    try {
      // Acumular el body de la request
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);

      // Construir la URL completa para el Request
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || 'localhost';
      const url = `${protocol}://${host}${req.url}`;

      // Crear Request object para el webhook handler
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.length ? body : undefined
      });

      // Procesar con el handler de webhook
      const response = await handleWebhook(request);
      
      // Enviar respuesta
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      const responseText = await response.text();
      res.end(responseText);
      
    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  } else {
    // Para cualquier otra ruta, responder con 404 y mensaje útil
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      error: 'Not found', 
      message: 'Este espacio solo acepta POST en /webhook para Telegram',
      endpoints: ['/webhook (POST)']
    }));
  }
});

// Escuchar en el puerto configurado
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor webhook escuchando en puerto ${PORT}`);
  console.log(`🔗 URL del webhook: https://${spaceId}/webhook`);
});

// Manejo de errores del servidor
server.on('error', (error) => {
  console.error('💥 Error en el servidor:', error);
});

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('👋 Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

console.log('✅ Configuración completa. Esperando mensajes...');