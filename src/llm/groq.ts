import Groq from 'groq-sdk';

// Inicializar Groq con API key desde variables de entorno
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

export async function callGroq(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Modelo gratuito y potente
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente de IA amigable y útil. Responde de manera concisa pero completa.'
        },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1024
    });

    return response.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
  } catch (error) {
    console.error('Error en Groq API:', error);
    throw error;
  }
}
