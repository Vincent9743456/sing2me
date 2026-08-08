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
import { EN_SETLISTS } from './i18n/en-setlists';

export const EN: Record<string, string> = {
  ...EN_COMMUN,
  ...EN_MORCEAUX,
  ...EN_SETLISTS,
  ...EN_ARTISTE,
  ...EN_COMPTE,
  ...EN_COMPOSANTS,
};
