import express, { Request, Response } from 'express';
import { startBot, webhookHandler } from './bot/index.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7860;
const spaceId = process.env.MY_SPACE_ID || 'Dinoch-Agente.hf.space';

console.log('🚀 Iniciando Agente IA con Express...');
console.log(`📅 ${new Date().toISOString()}`);

// Middleware para capturar raw body ANTES de que express.json lo procese
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use(express.urlencoded({ extended: true }));

// Middleware de logging para todas las peticiones
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(60));
  console.log(`📡 ${req.method} ${req.path} desde ${req.ip}`);
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log(`📋 Headers:`, req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body parseado:`, JSON.stringify(req.body, null, 2));
  }
  if (req.rawBody) {
    console.log(`📦 Raw body (primeros 200 chars): ${req.rawBody.substring(0, 200)}`);
  }
  next();
});

// Ruta raíz de diagnóstico
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: 'OpenGravity Agent',
    version: '1.0.0',
    description: 'Servidor de agente IA para Telegram',
    space_id: spaceId,
    port: PORT,
    webhook_url: `https://${spaceId}/webhook`,
    timestamp: new Date().toISOString()
  });
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Endpoint del webhook de Telegram - VERSIÓN CORREGIDA
app.post('/webhook', async (req: any, res: Response) => {
  console.log('🔄 Procesando webhook de Telegram...');
  
  try {
    // Usar raw body si está disponible, si no, serializar el body parseado
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    // Crear headers básicos
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    headers.set('content-length', Buffer.byteLength(rawBody).toString());
    
    // Reconstruir headers originales útiles (especialmente para Telegram)
    if (req.headers['x-telegram-bot-api-secret-token']) {
      headers.set('x-telegram-bot-api-secret-token', req.headers['x-telegram-bot-api-secret-token']);
    }
    if (req.headers['x-forwarded-for']) {
      headers.set('x-forwarded-for', req.headers['x-forwarded-for']);
    }

    // Crear Request para grammy
    const request = new Request(`https://${spaceId}/webhook`, {
      method: 'POST',
      headers: headers,
      body: rawBody
    });

    // Pasar al handler de grammy
    const response = await webhookHandler(request);
    
    // Enviar respuesta
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const responseText = await response.text();
    res.send(responseText);
    
    console.log(`✅ Webhook procesado, status: ${response.status}`);
    if (response.status !== 200) {
      console.log(`⚠️ Respuesta: ${responseText.substring(0, 200)}`);
    }
    
  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Este espacio solo acepta POST en /webhook para Telegram',
    endpoints: ['/', '/health', '/webhook (POST)']
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🌐 Servidor Express escuchando en:`);
  console.log(`   - Puerto: ${PORT}`);
  console.log(`   - URL pública: https://${spaceId}`);
  console.log(`   - Webhook: https://${spaceId}/webhook`);
  console.log('='.repeat(60));
  console.log('\n✅ Servidor listo');
});

// Iniciar bot (solo configuración, no webhook automático)
startBot().catch(console.error);

// Manejar cierre graceful
process.on('SIGTERM', () => {
  console.log('👋 Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 Cerrando servidor...');
  process.exit(0);
});  process.exit(0);
});