import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = '/tmp/audio-cache'; // Render tiene /tmp temporal

export class AudioCache {
  private cacheDir: string;

  constructor() {
    this.cacheDir = CACHE_DIR;
    this.ensureCacheDir();
  }

  private ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // Generar clave única para texto + voz
  getCacheKey(text: string, voiceId: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${text}-${voiceId}`)
      .digest('hex');
    return path.join(this.cacheDir, `${hash}.mp3`);
  }

  // Guardar audio en cache
  saveToCache(key: string, audioBuffer: Buffer): void {
    try {
      fs.writeFileSync(key, audioBuffer);
      console.log(`💾 Audio guardado en cache: ${key}`);
    } catch (error) {
      console.error('Error guardando en cache:', error);
    }
  }

  // Cargar audio de cache
  loadFromCache(key: string): Buffer | null {
    try {
      if (fs.existsSync(key)) {
        console.log(`✅ Audio cargado de cache: ${key}`);
        return fs.readFileSync(key);
      }
    } catch (error) {
      console.error('Error cargando de cache:', error);
    }
    return null;
  }

  // Limpiar cache antiguo (opcional)
  cleanupOldFiles(maxAgeHours: number = 24) {
    // Implementar si es necesario
  }
}

export const audioCache = new AudioCache();
