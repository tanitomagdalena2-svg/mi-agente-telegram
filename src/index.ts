import { startBot } from './bot/index.js';
import { handleWebhook } from './webhook.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Iniciando Agente IA...');
console.log(`📅 ${new Date().toISOString()}`);

// Verificar variables esenciales
const requiredVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_IDS'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Variable faltante: ${varName}`);
    process.exit(1);
  } else {
    console.log(`✅ ${varName}: presente`);
  }
}

// Usar MY_SPACE_ID en lugar de SPACE_ID (que está reservado)
const spaceId = process.env.MY_SPACE_ID || 'Dinoch-Agente.hf.space';
console.log(`🌐 Space ID configurado: ${spaceId}`);

// Guardar en process.env para que otros módulos puedan usarlo
process.env.MY_SPACE_ID = spaceId;

// Mostrar información del token (solo primeros caracteres)
const token = process.env.TELEGRAM_BOT_TOKEN || '';
console.log(`🔑 Token (primeros 5 chars): ${token.substring(0, 5)}...`);

// Mostrar usuarios permitidos
const allowedUsers = process.env.TELEGRAM_ALLOWED_USER_IDS || '';
console.log(`👥 Usuarios permitidos: ${allowedUsers}`);

// Iniciar configuración del bot (solo muestra instrucciones, no intenta conectar)
startBot().catch(error => {
  console.error('💥 Error fatal en startBot:', error);
});

// PUERTO - configurable por variable de entorno
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7860;
console.log(`🔧 Puerto configurado: ${PORT}`);

// --- Helper function to get body from request ---
async function getRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// --- Helper function to log request details ---
function logRequest(req: IncomingMessage, body: Buffer) {
  console.log('\n' + '='.repeat(60));
  console.log(`📡 ${req.method} ${req.url} desde ${req.socket.remoteAddress || 'desconocido'}`);
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log(`📋 Headers:`, JSON.stringify(req.headers, null, 2));
  
  if (body.length > 0) {
    const bodyPreview = body.toString('utf8').substring(0, 200);
    console.log(`📦 Body (${body.length} bytes): ${bodyPreview}${body.length > 200 ? '...' : ''}`);
    
    // Intentar parsear como JSON para mejor diagnóstico
    try {
      const jsonBody = JSON.parse(body.toString('utf8'));
      console.log(`📊 JSON parseado:`, JSON.stringify(jsonBody, null, 2).substring(0, 300));
    } catch {
      console.log(`📄 Body no es JSON válido (o no es texto)`);
    }
  } else {
    console.log(`📦 Body vacío`);
  }
}

// --- Helper function to send JSON response ---
function sendJsonResponse(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data, null, 2));
}

// --- Crear servidor HTTP mejorado para recibir webhooks ---
const server = createServer(async (req, res) => {
  try {
    // Obtener body completo
    const body = await getRequestBody(req);
    
    // Log detallado de la petición
    logRequest(req, body);

    // Manejar preflight requests (OPTIONS)
    if (req.method === 'OPTIONS') {
      console.log('🔄 Respondiendo a OPTIONS preflight');
      sendJsonResponse(res, 204, {});
      return;
    }

    // Construir la URL completa para el Request object
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = `${protocol}://${host}${req.url}`;

    // Verificar si es un webhook de Telegram
    const isWebhook = req.url?.startsWith('/webhook');
    
    if (isWebhook && req.method === 'POST') {
      console.log('🔄 Procesando webhook de Telegram...');
      
      try {
        // Crear Request object para el webhook handler
        const request = new Request(fullUrl, {
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
        
        console.log(`✅ Webhook procesado, status: ${response.status}`);
        
      } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        sendJsonResponse(res, 500, { 
          error: 'Internal Server Error', 
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Para cualquier otra ruta, responder con información de diagnóstico
      console.log(`ℹ️ Ruta no webhook: ${req.method} ${req.url}`);
      
      sendJsonResponse(res, 200, {
        status: 'ok',
        name: 'OpenGravity Agent',
        version: '1.0.0',
        description: 'Servidor de agente IA para Telegram',
        endpoints: {
          webhook: {
            url: '/webhook',
            method: 'POST',
            description: 'Endpoint para recibir actualizaciones de Telegram'
          },
          health: {
            url: '/health',
            method: 'GET',
            description: 'Verificar estado del servidor'
          }
        },
        current_request: {
          method: req.method,
          url: req.url,
          timestamp: new Date().toISOString()
        },
        config: {
          space_id: spaceId,
          port: PORT,
          webhook_url: `https://${spaceId}/webhook`,
          allowed_users: allowedUsers.split(',').map(id => id.trim())
        },
        telegram: {
          token_preview: token.substring(0, 5) + '...',
          webhook_info_url: `https://api.telegram.org/bot${token}/getWebhookInfo`
        }
      });
    }
  } catch (error) {
    console.error('💥 Error no manejado en servidor:', error);
    sendJsonResponse(res, 500, {
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// --- Endpoint de salud adicional (opcional) ---
// Podrías agregar un manejador específico para /health si lo deseas

// --- Iniciar servidor ---
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🌐 Servidor webhook escuchando en:`);
  console.log(`   - Puerto: ${PORT}`);
  console.log(`   - URL local: http://0.0.0.0:${PORT}`);
  console.log(`   - URL pública: https://${spaceId}`);
  console.log(`   - Webhook: https://${spaceId}/webhook`);
  console.log('='.repeat(60));
  console.log('');
  console.log('📋 Endpoints disponibles:');
  console.log(`   GET  /         - Información del servidor`);
  console.log(`   POST /webhook  - Webhook de Telegram`);
  console.log('');
  console.log('✅ Servidor listo para recibir peticiones');
});

// --- Manejo de errores del servidor ---
server.on('error', (error) => {
  console.error('💥 Error en el servidor:', error);
});

// --- Manejar cierre graceful ---
function shutdown(signal: string) {
  console.log(`\n👋 Recibida señal ${signal}, cerrando servidor...`);
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
  
  // Forzar cierre después de 5 segundos si no responde
  setTimeout(() => {
    console.error('💥 Forzando cierre por timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log final de inicio
console.log('\n✅ Configuración completa. Esperando mensajes...\n');