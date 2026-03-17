import express, { Request, Response } from 'express';
import { startBot } from './bot/index.js';
import { handleWebhook } from './webhook.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7860;
const spaceId = process.env.MY_SPACE_ID || 'Dinoch-Agente.hf.space';

console.log('🚀 Iniciando Agente IA con Express...');
console.log(`📅 ${new Date().toISOString()}`);

// Middleware para parsear JSON (crucial para Telegram)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging para todas las peticiones
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(60));
  console.log(`📡 ${req.method} ${req.path} desde ${req.ip}`);
  console.log(`🕐 ${new Date().toISOString()}`);
  console.log(`📋 Headers:`, req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
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

// Endpoint del webhook de Telegram
app.post('/webhook', async (req: Request, res: Response) => {
  console.log('🔄 Procesando webhook de Telegram...');
  
  try {
    // Verificar que el body existe
    if (!req.body) {
      console.error('❌ Body vacío recibido');
      return res.status(400).json({ error: 'Empty body' });
    }

    // Construir un objeto Request similar al que espera grammy
    // Nota: grammy puede funcionar directamente con el req de Express
    // pero por simplicidad, creamos uno similar al estándar Fetch API
    const request = new Request(`https://${spaceId}/webhook`, {
      method: 'POST',
      headers: req.headers as HeadersInit,
      body: JSON.stringify(req.body)
    });

    // Pasar al handler de grammy
    const response = await handleWebhook(request);
    
    // Enviar la respuesta de vuelta a Telegram
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const responseText = await response.text();
    res.send(responseText);
    
    console.log(`✅ Webhook procesado, status: ${response.status}`);
    
  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
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