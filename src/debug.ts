console.log('🔍 Variables de entorno:');
console.log('- TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✓ presente' : '✗ faltante');
console.log('- TELEGRAM_ALLOWED_USER_IDS:', process.env.TELEGRAM_ALLOWED_USER_IDS ? '✓ presente' : '✗ faltante');

// Mostrar los primeros caracteres del token (seguro)
const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) {
  console.log('  Token (primeros 5 chars):', token.substring(0, 5) + '...');
}

process.exit(0);