import dns from 'dns';
import https from 'https';

console.log('🔍 Diagnóstico de red...');

// Test 1: Resolver api.telegram.org
dns.lookup('api.telegram.org', (err, address) => {
    if (err) {
        console.log('❌ No se puede resolver api.telegram.org:', err.message);
    } else {
        console.log('✅ api.telegram.org resuelve a:', address);
    }
});

// Test 2: Hacer una petición simple
https.get('https://api.telegram.org', (res) => {
    console.log('✅ Conexión a api.telegram.org exitosa, status:', res.statusCode);
}).on('error', (err) => {
    console.log('❌ Error conectando a api.telegram.org:', err.message);
});

// Test 3: Verificar puertos
console.log('🌐 Servidor escuchando en puerto:', process.env.PORT || 7860);