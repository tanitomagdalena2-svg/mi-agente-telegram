import { webhookHandler } from './bot/index.js';

// Manejador para el endpoint /webhook
export async function handleWebhook(request: Request): Promise<Response> {
  try {
    // Verificar que sea POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Pasar la petición al manejador de grammy
    return await webhookHandler(request);
  } catch (error) {
    console.error('Error en webhook:', error);
    return new Response('Internal server error', { status: 500 });
  }
}