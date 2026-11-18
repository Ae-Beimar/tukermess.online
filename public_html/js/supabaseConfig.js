// =====================================================================
//  Configuración de Supabase y de la app
//  Reemplaza los dos valores de abajo con los de TU proyecto:
//  Supabase Dashboard > Project Settings > Data API  (Project URL)
//  Supabase Dashboard > Project Settings > API Keys  (anon public / publishable)
//
//  Es seguro que esta clave esté en el navegador: es pública por diseño.
//  La seguridad la dan las políticas RLS. NUNCA pongas aquí la
//  "service_role" / "secret" key.
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

export const SUPABASE_URL = 'https://ihcayzvqjsbvqfboghak.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9sWxLoyJmupPnOQM8jKbTg_GkQKqTrO';

export const APP_CONFIG = {
  cityName: 'Santa Cruz',
  mapCenter: [-17.7834, -63.1821], // Plaza 24 de Septiembre, Santa Cruz de la Sierra
  mapZoom: 13,
  locale: 'es-BO',
  currency: 'BOB',
  storageBucket: 'kermes-images',
};

export const isSupabaseConfigured =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.startsWith('TU-');

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
