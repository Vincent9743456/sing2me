/**
 * Ce qu'est UN LIVE (b182) — définition unique, partagée par l'historique de
 * l'onglet Live et le compteur de la fiche Artiste.
 *
 * Un live = un appui sur GO LIVE. Le serveur crée une ligne par direct et la
 * conserve à l'arrêt : elle porte son début, sa fin, qui jouait et la setlist.
 * C'est la borne EXACTE d'un concert.
 *
 * Avant ce lot, on devinait les frontières au temps écoulé (« plus de 3 h
 * entre deux morceaux = deux concerts »). Cette règle fusionnait deux sets
 * rapprochés en un seul et coupait une longue soirée en deux — Vincent l'a
 * constaté le jour même. Elle ne survit que pour les directs d'AVANT ce lot,
 * dont les bornes ont été effacées à la clôture : leurs morceaux orphelins
 * sont encore regroupés ainsi, faute de mieux.
 *
 * Deux écrans lisaient ces données chacun de leur côté ; ils comptaient donc
 * les lives différemment. Une seule fonction, un seul chiffre.
 */
import { LiveMessage, LiveSession, LiveStat, PastLiveRow } from './live';

/** Un direct passé, avec tout ce qui s'y est produit. */
export interface PastLive {
  id: string;
  startedAt: string;
  endedAt: string | null;
  uniques: number;
  songs: LiveStat[];
  messages: LiveMessage[];
  hearts: number;
  /** Qui jouait : '' = soi (solo), sinon le nom du groupe. */
  band: string;
  /** Setlist tournée, '' si aucune (ou SQL pas encore rejoué). */
  setlist: string;
}

export interface PastLivesInput {
  /** Les directs enregistrés côté serveur (source de vérité). */
  rows: PastLiveRow[];
  /** Séances de mesure d'audience — seule source du nombre de spectateurs. */
  sessions: LiveSession[] | null;
  stats: LiveStat[];
  messages: LiveMessage[];
  /** Mon nom d'artiste + ceux de mes groupes (identités affichées). */
  names: string[];
  /** cloudId des groupes dont je suis membre. */
  bandCloudIds: string[];
  /** Mes noms personnels (nom d'artiste, pseudo) : « qui a lancé ». */
  me: string[];
  /** Mon nom d'artiste, pour distinguer « Solo » d'un concert de groupe. */
  artistName: string;
  /** Injectable pour les tests ; sinon l'heure courante. */
  now?: number;
}

/** Un morceau joué juste avant/après la borne appartient quand même au live. */
const MARGE_MS = 30 * 60 * 1000;
/** Repli historique : écart au-delà duquel deux morceaux font deux concerts. */
const TROU_MS = 3 * 60 * 60 * 1000;

export function buildPastLives(input: PastLivesInput): PastLive[] {
  const { rows, sessions, stats, messages, artistName } = input;
  const maintenant = input.now ?? Date.now();
  const mine = new Set(
    input.names.map((n) => n.trim().toLowerCase()).filter((n) => n !== ''),
  );
  const mesGroupes = new Set(
    input.bandCloudIds.map((c) => c.trim()).filter((c) => c !== ''),
  );
  const moi = input.me.map((n) => n.trim().toLowerCase()).filter((n) => n !== '');
  const moiSeul = artistName.trim().toLowerCase();

  const aMoi = (v: string | null | undefined) => {
    const w = String(v ?? '')
      .trim()
      .toLowerCase();
    return w === '' || mine.size === 0 || mine.has(w);
  };
  /**
   * Ce live est-il le mien ? Trois façons de l'être — il porte mon nom (ou
   * celui d'un de mes groupes), il est tagué d'un groupe dont je suis membre,
   * ou c'est MOI qui l'ai lancé. La troisième compte : un concert lancé au nom
   * d'un groupe porte le nom du GROUPE, et disparaissait de mon historique
   * tant que ce groupe n'était pas encore dans ma bibliothèque.
   */
  const monLive = (r: PastLiveRow) => {
    const par = String(r.started_by ?? '')
      .trim()
      .toLowerCase();
    if (par !== '' && moi.includes(par)) return true;
    const bid = String(r.band_id ?? '').trim();
    if (bid !== '' && mesGroupes.has(bid)) return true;
    return aMoi(r.artist?.name);
  };
  const at = (iso: string | null | undefined) => {
    const v = new Date(String(iso ?? '')).getTime();
    return Number.isFinite(v) ? v : NaN;
  };
  /** Le nom affiché est-il un groupe, ou moi ? */
  const groupe = (nom: string) =>
    nom !== '' && nom.toLowerCase() !== moiSeul ? nom : '';

  const mesSeances = (sessions ?? []).filter((s) => aMoi(s.artist_name));
  const restants = new Set(stats.map((_, i) => i));

  const construit = (
    id: string,
    debut: number,
    fin: number,
    opts: { band: string; setlist: string; ouvert: boolean; uniques: number },
  ): PastLive => {
    const songs: LiveStat[] = [];
    stats.forEach((x, i) => {
      const t = at(x.played_at);
      if (!restants.has(i) || Number.isNaN(t)) return;
      if (t >= debut - MARGE_MS && t <= fin + MARGE_MS) {
        songs.push(x);
        restants.delete(i);
      }
    });
    songs.sort((a, b) => a.played_at.localeCompare(b.played_at));
    const msgs = messages.filter((m) => {
      const t = at(m.created_at);
      return !Number.isNaN(t) && t >= debut - MARGE_MS && t <= fin + MARGE_MS;
    });
    return {
      id,
      startedAt: new Date(debut).toISOString(),
      endedAt: opts.ouvert ? null : new Date(fin).toISOString(),
      uniques: opts.uniques,
      songs,
      messages: msgs,
      hearts: songs.reduce((n, x) => n + x.hearts, 0),
      band: opts.band,
      setlist: opts.setlist,
    };
  };

  const out: PastLive[] = [];
  // 1) Les lives RÉELLEMENT enregistrés, du plus récent au plus ancien.
  for (const r of [...rows].sort((a, b) =>
    String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')),
  )) {
    const debut = at(r.started_at);
    if (Number.isNaN(debut)) continue; // live d'avant b182 : bornes perdues
    if (!monLive(r)) continue;
    const ouvert = r.status !== 'off';
    const fin = ouvert ? maintenant : at(r.updated_at) || debut;
    const seance = mesSeances.find((se) => se.id === r.session_id);
    out.push(
      construit(r.id, debut, fin, {
        band: groupe((r.artist?.name ?? '').trim()),
        setlist: r.setlist_name ?? '',
        ouvert,
        uniques: seance?.uniques ?? 0,
      }),
    );
  }
  // 2) Morceaux orphelins (lives d'avant b182) : reconstitution au temps.
  const orphelins = [...restants]
    .map((i) => stats[i])
    .filter((x) => !Number.isNaN(at(x.played_at)))
    .sort((a, b) => a.played_at.localeCompare(b.played_at));
  let paquet: LiveStat[] = [];
  const vider = () => {
    if (paquet.length === 0) return;
    const debut = at(paquet[0].played_at);
    const fin = at(paquet[paquet.length - 1].played_at);
    out.push(
      construit(`t:${paquet[0].played_at}`, debut, fin, {
        band: groupe(
          (paquet.find((x) => (x.performer ?? '') !== '')?.performer ?? '').trim(),
        ),
        setlist:
          paquet.find((x) => (x.setlist_name ?? '') !== '')?.setlist_name ?? '',
        ouvert: false,
        uniques: 0,
      }),
    );
    paquet = [];
  };
  for (const x of orphelins) {
    const precedent = paquet[paquet.length - 1];
    if (precedent && at(x.played_at) - at(precedent.played_at) > TROU_MS) vider();
    paquet.push(x);
  }
  vider();

  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
