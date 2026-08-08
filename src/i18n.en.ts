/**
 * Dictionnaire anglais, assemblé par domaines (un fichier par lot de
 * traduction — clé = chaîne française EXACTE du code, valeur = anglais).
 * Une chaîne absente d'ici s'affiche en français (repli sûr).
 */
import { EN_ARTISTE } from './i18n/en-artiste';
import { EN_COMMUN } from './i18n/en-commun';
import { EN_COMPOSANTS } from './i18n/en-composants';
import { EN_COMPTE } from './i18n/en-compte';
import { EN_MORCEAUX } from './i18n/en-morceaux';
import { EN_PUBLIC } from './i18n/en-public';
import { EN_SETLISTS } from './i18n/en-setlists';

export const EN: Record<string, string> = {
  ...EN_COMMUN,
  ...EN_MORCEAUX,
  ...EN_SETLISTS,
  ...EN_ARTISTE,
  ...EN_COMPTE,
  ...EN_COMPOSANTS,
  // Pages publiques : l'app musicien les affiche aussi (routes /s/…,
  // /live, /nom) — l'entrée légère, elle, ne charge QUE ce domaine.
  ...EN_PUBLIC,
};
