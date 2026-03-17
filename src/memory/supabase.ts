import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase no configurado. La memoria no funcionará.');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export class MemoryStore {
  async save(userId: string, sessionId: string, role: string, content: string) {
    if (!supabase) {
      console.log('💾 [MEMORIA SIMULADA]', { userId, sessionId, role, content });
      return { id: 'simulated' };
    }

    const { data, error } = await supabase
      .from('agent_memory')
      .insert([{
        user_id: userId,
        session_id: sessionId,
        role,
        content,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error guardando en Supabase:', error);
      return null;
    }
    return data;
  }
}

export const memoryStore = new MemoryStore();