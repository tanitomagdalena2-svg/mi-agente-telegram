import { createClient } from '@supabase/supabase-js';

// Inicializar Supabase con variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de Supabase en el entorno');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export interface Memory {
  id?: string;
  user_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at?: string;
  metadata?: Record<string, any>;
  tool_calls?: any;
  tool_call_id?: string;
}

export class MemoryStore {
  // Guardar un mensaje en Supabase
  async save(memory: Omit<Memory, 'id' | 'created_at'>) {
    if (!supabase) {
      console.log('💾 [MEMORIA LOCAL]', memory);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('agent_memory')
        .insert([{
          user_id: memory.user_id,
          session_id: memory.session_id,
          role: memory.role,
          content: memory.content,
          metadata: memory.metadata || {},
          tool_calls: memory.tool_calls || null,
          tool_call_id: memory.tool_call_id || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Error guardando en Supabase:', error);
      return null;
    }
  }

  // Obtener historial reciente de un usuario
  async getUserHistory(userId: string, limit: number = 50) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error leyendo historial de Supabase:', error);
      return [];
    }
  }

  // Obtener historial de una sesión específica
  async getSessionHistory(sessionId: string) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error leyendo sesión de Supabase:', error);
      return [];
    }
  }

  // Limpiar registros antiguos (opcional)
  async cleanupOldEntries(days: number = 30) {
    if (!supabase) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      await supabase
        .from('agent_memory')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      console.log(`🧹 Limpiados registros anteriores a ${cutoffDate.toISOString()}`);
    } catch (error) {
      console.error('❌ Error limpiando Supabase:', error);
    }
  }
}

export const memoryStore = new MemoryStore();
