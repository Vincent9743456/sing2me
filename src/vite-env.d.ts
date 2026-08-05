/// <reference types="vite/client" />

/**
 * Variables d'environnement Vite embarquées côté client.
 * (Remplacées statiquement au build — accès en dur obligatoire.)
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** '1' pour afficher Google/Facebook (une fois activés dans Supabase). */
  readonly VITE_OAUTH_ENABLED?: string;
  /**
   * Clé du direct embarquée (= LIVE_KEY côté serveur). Si présente, l'app
   * la renseigne toute seule : l'utilisateur n'a rien à saisir pour le
   * mode ON AIR.
   */
  readonly VITE_LIVE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
