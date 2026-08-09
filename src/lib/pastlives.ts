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
  /** Qui a appuyé sur GO LIVE, si ce n'est pas moi ('' sinon). */
  startedBy: string;
  /** Setlist tournée, '' si aucune (ou SQL pas encore rejoué). */
  setlist: string;
  /** Concert planifié auquel ce direct a été rattaché au lancement (b207). */
  concertId: string;
  concertTitle: string;
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
  /** Mes groupes : cloudId (appartenance) et nom (affichage). */
  bands: { cloudId: string; name: string }[];
  /** Mes noms personnels (nom d'artiste, pseudo) : « qui a lancé ». */
  me: string[];
  /** Mon nom d'artiste, pour distinguer « Solo » d'un concert de groupe. */
  artistName: string;
  /** Injectable pour les tests ; sinon l'heure courante. */
  now?: number;
  /**
   * Point zéro de l'historique (b200) : les lives commencés AVANT cette date
   * ne s'affichent plus. Posé en réinitialisant les concerts — rien n'est
   * effacé côté serveur, les autres membres gardent le leur.
   */
  depuis?: string;
}

/**
 * Tolérance d'horloge pour les lignes SANS identifiant de séance (données
 * d'avant b186). Volontairement courte : à 30 minutes, un live de deux
 * minutes absorbait les morceaux qu'un autre musicien jouait une demi-heure
 * plus tôt — Vincent a vu dans son historique une chanson qu'il n'a pas.
 */
const MARGE_MS = 2 * 60 * 1000;
/** Repli historique : écart au-delà duquel deux morceaux font deux concerts. */
const TROU_MS = 3 * 60 * 60 * 1000;

export function buildPastLives(input: PastLivesInput): PastLive[] {
  const { rows, sessions, stats, messages, artistName } = input;
  const maintenant = input.now ?? Date.now();
  const mine = new Set(
    input.names.map((n) => n.trim().toLowerCase()).filter((n) => n !== ''),
  );
  const mesGroupes = new Map<string, string>(
    input.bands
      .map((b): [string, string] => [b.cloudId.trim(), b.name.trim()])
      .filter(([c]) => c !== ''),
  );
  const moi = input.me.map((n) => n.trim().toLowerCase()).filter((n) => n !== '');
  const moiSeul = artistName.trim().toLowerCase();

  /**
   * Ce live est-il le mien ? Quatre questions, dans cet ordre — et JAMAIS de
   * « oui » par défaut (b183). L'ancienne version considérait un live sans
   * nom d'artiste comme appartenant à tout le monde : l'historique d'un autre
   * musicien pouvait atterrir chez soi.
   *
   * Règle actée : je l'ai lancé → il est à moi ; il est tagué d'un groupe →
   * il appartient aux MEMBRES de ce groupe (un concert de groupe est un acte
   * collectif) ; lancé en solo par quelqu'un d'autre → il ne me regarde pas.
   */
  const monLive = (r: PastLiveRow) => {
    const par = String(r.started_by ?? '')
      .trim()
      .toLowerCase();
    if (par !== '' && moi.includes(par)) return true;
    const bid = String(r.band_id ?? '').trim();
    if (bid !== '') return mesGroupes.has(bid);
    if (par !== '') return false; // solo de quelqu'un d'autre
    const nom = String(r.artist?.name ?? '')
      .trim()
      .toLowerCase();
    return nom !== '' && mine.has(nom); // vieux live, sans lanceur enregistré
  };
  const at = (iso: string | null | undefined) => {
    const v = new Date(String(iso ?? '')).getTime();
    return Number.isFinite(v) ? v : NaN;
  };
  /** Le nom affiché est-il un groupe, ou moi ? */
  const groupe = (nom: string) =>
    nom !== '' && nom.toLowerCase() !== moiSeul ? nom : '';
  /** Qui a lancé, à n'afficher que si ce n'est pas moi. */
  const lanceur = (v: string | null | undefined) => {
    const w = String(v ?? '').trim();
    return w !== '' && !moi.includes(w.toLowerCase()) ? w : '';
  };

  const mesSeances = sessions ?? [];
  const restants = new Set(stats.map((_, i) => i));
  /** Séances déjà rattachées à un live : jamais comptées deux fois. */
  const seancesPrises = new Set<string>();

  const construit = (
    id: string,
    debut: number,
    fin: number,
    opts: {
      band: string;
      startedBy: string;
      setlist: string;
      ouvert: boolean;
      uniques: number;
      concertId?: string;
      concertTitle?: string;
      /** Séance ON AIR de ce live : rattachement EXACT des morceaux. */
      sessionId?: string | null;
      /** Identifiant du live : rattachement EXACT des mots du public. */
      liveId?: string;
    },
  ): PastLive => {
    const sid = String(opts.sessionId ?? '').trim();
    const lid = String(opts.liveId ?? '').trim();
    const songs: LiveStat[] = [];
    stats.forEach((x, i) => {
      if (!restants.has(i)) return;
      const marque = String(x.session_id ?? '').trim();
      // Morceau MARQUÉ : il n'appartient qu'à SA séance. Jamais de repêchage
      // à l'heure — c'est ainsi que le morceau d'un autre musicien, joué au
      // même moment, atterrissait dans le live de quelqu'un d'autre (b186).
      if (marque !== '') {
        if (marque === sid) {
          songs.push(x);
          restants.delete(i);
        }
        return;
      }
      const t = at(x.played_at);
      if (Number.isNaN(t)) return;
      if (t >= debut - MARGE_MS && t <= fin + MARGE_MS) {
        songs.push(x);
        restants.delete(i);
      }
    });
    songs.sort((a, b) => a.played_at.localeCompare(b.played_at));
    const msgs = messages.filter((m) => {
      const marque = String(m.live_id ?? '').trim();
      // Mot marqué ET live identifié : correspondance exacte, un point.
      // Si le live n'a pas d'identifiant (reconstitution d'une archive), on
      // retombe sur l'heure — mieux vaut un mot rattaché approximativement
      // qu'un mot invisible.
      if (marque !== '' && lid !== '') return marque === lid;
      const t = at(m.created_at);
      return !Number.isNaN(t) && t >= debut - MARGE_MS && t <= fin + MARGE_MS;
    });
    const hearts = songs.reduce((n, x) => n + x.hearts, 0);
    /*
     * PLANCHER DE BON SENS (b201, remarque de Vincent) : « je ne peux pas
     * avoir eu 0 spectateur si j'ai reçu 1 message et 1 cœur ».
     *
     * Le comptage des présences vient d'un signalement que le spectateur
     * peut ne jamais envoyer — il repart avant, le réseau coupe, la page se
     * ferme. Un cœur ou un mot, eux, PROUVENT qu'il y avait quelqu'un. Le
     * chiffre affiché ne doit jamais contredire ce qu'on lit juste à côté.
     * On ne gonfle rien : on garantit seulement qu'il n'annonce pas moins
     * que ce qui est démontré.
     */
    const prouve = hearts > 0 || msgs.length > 0 ? 1 : 0;
    return {
      id,
      startedAt: new Date(debut).toISOString(),
      endedAt: opts.ouvert ? null : new Date(fin).toISOString(),
      uniques: Math.max(opts.uniques, prouve),
      songs,
      messages: msgs,
      hearts,
      band: opts.band,
      startedBy: opts.startedBy,
      setlist: opts.setlist,
      concertId: opts.concertId ?? '',
      concertTitle: opts.concertTitle ?? '',
    };
  };

  const zero = at(input.depuis);
  const apresLeZero = (debut: number) =>
    Number.isNaN(zero) || debut >= zero;

  const out: PastLive[] = [];
  // 1) Les lives RÉELLEMENT enregistrés, du plus récent au plus ancien.
  for (const r of [...rows].sort((a, b) =>
    String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')),
  )) {
    const debut = at(r.started_at);
    if (Number.isNaN(debut)) continue; // live d'avant b182 : bornes perdues
    if (!apresLeZero(debut)) continue; // effacé par une réinitialisation
    if (!monLive(r)) continue;
    const ouvert = r.status !== 'off';
    const fin = ouvert ? maintenant : at(r.updated_at) || debut;
    const seance = mesSeances.find((se) => se.id === r.session_id);
    if (seance) seancesPrises.add(seance.id);
    // Le nom du groupe vient de MA bibliothèque quand je le connais : c'est
    // le seul à jour si le groupe a été renommé depuis le concert.
    const duGroupe = mesGroupes.get(String(r.band_id ?? '').trim()) ?? '';
    out.push(
      construit(r.id, debut, fin, {
        band: duGroupe !== '' ? duGroupe : groupe((r.artist?.name ?? '').trim()),
        startedBy: lanceur(r.started_by),
        setlist: r.setlist_name ?? '',
        ouvert,
        uniques: seance?.uniques ?? 0,
        concertId: String(r.concert?.id ?? ''),
        concertTitle: String(r.concert?.title ?? ''),
        sessionId: r.session_id,
        liveId: r.id,
      }),
    );
  }
  // Un morceau joué par quelqu'un d'autre n'entre PAS dans mon historique,
  // même si le serveur me l'a laissé passer (b183). Le nom vide reste admis :
  // c'est l'archive d'avant la colonne `performer`.
  const aMoiLeMorceau = (x: LiveStat) => {
    const p = String(x.performer ?? '')
      .trim()
      .toLowerCase();
    return p === '' || mine.size === 0 || mine.has(p);
  };
  const reste = [...restants]
    .map((i) => stats[i])
    .filter((x) => !Number.isNaN(at(x.played_at)))
    .filter(aMoiLeMorceau);

  // 2) Morceaux d'une SÉANCE dont le live n'a pas été conservé (directs
  //    d'avant b182 : la ligne existait mais ses bornes ont été effacées à
  //    l'arrêt). La séance vaut alors borne — un GO LIVE, un live. C'est
  //    encore exact, contrairement au découpage au temps écoulé.
  const parSeance = new Map<string, LiveStat[]>();
  for (const x of reste) {
    const sid = String(x.session_id ?? '').trim();
    if (sid === '') continue;
    const l = parSeance.get(sid);
    if (l) l.push(x);
    else parSeance.set(sid, [x]);
  }
  for (const [sid, liste] of parSeance) {
    liste.sort((a, b) => a.played_at.localeCompare(b.played_at));
    const seance = mesSeances.find((se) => se.id === sid);
    if (seance) seancesPrises.add(seance.id);
    const debut = seance ? at(seance.started_at) : at(liste[0].played_at);
    const fin = seance?.ended_at
      ? at(seance.ended_at)
      : at(liste[liste.length - 1].played_at);
    out.push(
      construit(`s:${sid}`, Number.isNaN(debut) ? at(liste[0].played_at) : debut,
        Number.isNaN(fin) ? at(liste[liste.length - 1].played_at) : fin, {
        band: groupe(
          (liste.find((x) => (x.performer ?? '') !== '')?.performer ?? '').trim(),
        ),
        startedBy: '',
        setlist:
          liste.find((x) => (x.setlist_name ?? '') !== '')?.setlist_name ?? '',
        ouvert: false,
        uniques: seance?.uniques ?? 0,
        // Archives : le concert voyageait déjà sur chaque morceau joué.
        concertId: liste.find((x) => (x.concert_id ?? '') !== '')?.concert_id ?? '',
        concertTitle:
          liste.find((x) => (x.concert_title ?? '') !== '')?.concert_title ?? '',
        sessionId: sid,
      }),
    );
  }

  // 3) Morceaux sans aucun repère (archives les plus anciennes) : là
  //    seulement, reconstitution au temps écoulé.
  const orphelins = [...restants]
    .map((i) => stats[i])
    .filter((x) => !Number.isNaN(at(x.played_at)))
    .filter(aMoiLeMorceau)
    .sort((a, b) => a.played_at.localeCompare(b.played_at));
  let paquet: LiveStat[] = [];
  /**
   * Séance de mesure d'audience d'un live RECONSTITUÉ (b203). Ces lives-là
   * n'ont plus d'identifiant : leur public était donc perdu, et la fiche
   * artiste annonçait « 0 spectateurs » alors que la séance existait bel et
   * bien en base. On rattache par recouvrement des horaires — c'est la seule
   * piste qui reste, et elle est réservée aux archives sans identifiant,
   * comme le rattachement des morceaux (b186). Une séance déjà prise par un
   * vrai live n'est jamais recomptée.
   */
  const seancePour = (debut: number, fin: number): number => {
    const se = mesSeances.find((s) => {
      if (seancesPrises.has(s.id)) return false;
      const d = at(s.started_at);
      const f = s.ended_at ? at(s.ended_at) : maintenant;
      if (Number.isNaN(d)) return false;
      return d - MARGE_MS <= fin && (Number.isNaN(f) ? d : f) + MARGE_MS >= debut;
    });
    if (!se) return 0;
    seancesPrises.add(se.id);
    return se.uniques;
  };
  const vider = () => {
    if (paquet.length === 0) return;
    const debut = at(paquet[0].played_at);
    const fin = at(paquet[paquet.length - 1].played_at);
    out.push(
      construit(`t:${paquet[0].played_at}`, debut, fin, {
        band: groupe(
          (paquet.find((x) => (x.performer ?? '') !== '')?.performer ?? '').trim(),
        ),
        startedBy: '',
        setlist:
          paquet.find((x) => (x.setlist_name ?? '') !== '')?.setlist_name ?? '',
        ouvert: false,
        uniques: seancePour(debut, fin),
        concertId: paquet.find((x) => (x.concert_id ?? '') !== '')?.concert_id ?? '',
        concertTitle:
          paquet.find((x) => (x.concert_title ?? '') !== '')?.concert_title ?? '',
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

  return out
    .filter((l) => apresLeZero(at(l.startedAt)))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
