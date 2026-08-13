/**
 * PÉDALE MIDI (b296, demande de Vincent : « mettre dans les réglages un menu
 * qui permet de connecter sa pédale midi à l'application »).
 *
 * Connexion via l'API Web MIDI du navigateur — AUCUNE dépendance, rien à
 * installer, marche hors ligne une fois la permission accordée. Beaucoup de
 * pédales « tourne-pages » parlent déjà clavier Bluetooth (gérées dans le mode
 * scène) ; celles qui parlent MIDI (USB ou BLE-MIDI) passent par ici.
 *
 * C'est un réglage d'APPAREIL — la pédale est branchée SUR CE téléphone —,
 * donc il vit en localStorage (`sing2me/midi`), JAMAIS dans les `prefs`
 * synchronisés : sinon brancher une pédale ici l'annoncerait sur tous mes
 * appareils, dont aucun ne l'a.
 *
 * Une pédale se « reconnaît » par la SIGNATURE de son appui (type + numéro),
 * apprise en appuyant dessus une fois — jamais devinée. Trois actions, celles
 * du mode scène : morceau suivant, précédent, marche/arrêt du défilement.
 */

export type MidiAction =
  | 'suivant'
  | 'precedent'
  | 'defilement'
  | 'accelerer'
  | 'ralentir';

export interface MidiConfig {
  actif: boolean;
  /** id de l'entrée MIDI choisie ('' = n'importe laquelle). */
  entree: string;
  /** signature d'appui affectée à chaque action (« note:36 », « cc:64 »…). */
  map: Partial<Record<MidiAction, string>>;
}

const CLE = 'sing2me/midi';

function vide(): MidiConfig {
  return { actif: false, entree: '', map: {} };
}

let cache: MidiConfig | null = null;

export function lireMidiConfig(): MidiConfig {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(CLE);
    if (!raw) return (cache = vide());
    const o = JSON.parse(raw) as Partial<MidiConfig>;
    cache = {
      actif: o.actif === true,
      entree: typeof o.entree === 'string' ? o.entree : '',
      map: o.map && typeof o.map === 'object' ? o.map : {},
    };
    return cache;
  } catch {
    return (cache = vide());
  }
}

export function ecrireMidiConfig(c: MidiConfig): void {
  cache = c;
  try {
    localStorage.setItem(CLE, JSON.stringify(c));
  } catch {
    /* stockage indisponible */
  }
  // Un changement de config peut demander d'ouvrir l'accès (activation) : on
  // (ré)applique tout de suite, sans attendre un remontage d'écran.
  void appliquer();
}

export function midiDisponible(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { requestMIDIAccess?: unknown })
      .requestMIDIAccess === 'function'
  );
}

/**
 * Signature d'un APPUI (jamais d'un relâchement) : on ne retient que le geste
 * qui déclenche, pour ne pas agir deux fois (appui puis relâche).
 *  - note ON avec vélocité > 0 → « note:<n> » ;
 *  - contrôleur (CC) à valeur haute (≥ 64) → « cc:<n> » ;
 *  - changement de programme → « pc:<n> ».
 * Tout le reste (note OFF, CC relâché) ne signe rien.
 */
function signature(data: Uint8Array): string | null {
  if (data.length < 2) return null;
  const type = data[0] & 0xf0;
  const d1 = data[1];
  const d2 = data.length > 2 ? data[2] : 0;
  if (type === 0x90) return d2 > 0 ? `note:${d1}` : null;
  if (type === 0xb0) return d2 >= 64 ? `cc:${d1}` : null;
  if (type === 0xc0) return `pc:${d1}`;
  return null;
}

type AppuiCb = (sig: string, entreeId: string, entreeNom: string) => void;

const actionCbs = new Set<(a: MidiAction) => void>();
const appuiCbs = new Set<AppuiCb>();
const entreesCbs = new Set<() => void>();

let acces: MIDIAccess | null = null;
let accesEnCours: Promise<boolean> | null = null;

function surMessage(e: MIDIMessageEvent, id: string, nom: string): void {
  const data = e.data;
  if (!data) return;
  const sig = signature(data);
  if (sig === null) return;
  // Les écouteurs d'apprentissage voient TOUT (peu importe l'entrée choisie) :
  // on apprend en appuyant, avant même d'avoir désigné la pédale.
  appuiCbs.forEach((cb) => cb(sig, id, nom));
  const cfg = lireMidiConfig();
  if (!cfg.actif) return;
  if (cfg.entree !== '' && cfg.entree !== id) return;
  (Object.keys(cfg.map) as MidiAction[]).forEach((act) => {
    if (cfg.map[act] === sig) actionCbs.forEach((cb) => cb(act));
  });
}

function attacherEntrees(): void {
  if (!acces) return;
  acces.inputs.forEach((inp) => {
    // Un seul écouteur par entrée : réaffecter la même fonction est idempotent.
    inp.onmidimessage = (e) => surMessage(e, inp.id, inp.name ?? '');
  });
  entreesCbs.forEach((cb) => cb());
}

/** Ouvre l'accès MIDI (idempotent). Renvoie false si indisponible / refusé. */
export async function assurerAccesMidi(): Promise<boolean> {
  if (acces) return true;
  if (!midiDisponible()) return false;
  if (accesEnCours) return accesEnCours;
  accesEnCours = (async () => {
    try {
      acces = await navigator.requestMIDIAccess({ sysex: false });
      acces.onstatechange = () => attacherEntrees();
      attacherEntrees();
      return true;
    } catch {
      acces = null;
      return false;
    } finally {
      accesEnCours = null;
    }
  })();
  return accesEnCours;
}

/** (Ré)applique la config : ouvre l'accès si la pédale est activée. */
async function appliquer(): Promise<void> {
  const cfg = lireMidiConfig();
  if (cfg.actif || appuiCbs.size > 0) {
    await assurerAccesMidi();
  }
}

/** À appeler au démarrage d'un écran qui écoute la pédale (mode scène). */
export function demarrerMidi(): void {
  if (lireMidiConfig().actif) void assurerAccesMidi();
}

/** Les entrées MIDI actuellement connectées (après `assurerAccesMidi`). */
export function entreesMidi(): { id: string; nom: string }[] {
  if (!acces) return [];
  const out: { id: string; nom: string }[] = [];
  acces.inputs.forEach((inp) => out.push({ id: inp.id, nom: inp.name ?? inp.id }));
  return out;
}

/** Écoute les ACTIONS de la pédale (mode scène). Renvoie le désabonnement. */
export function sabonnerActionMidi(cb: (a: MidiAction) => void): () => void {
  actionCbs.add(cb);
  return () => actionCbs.delete(cb);
}

/** Écoute chaque APPUI brut (écran de réglage : apprentissage + liste). */
export function sabonnerAppuiMidi(cb: AppuiCb): () => void {
  appuiCbs.add(cb);
  void appliquer();
  return () => appuiCbs.delete(cb);
}

/** Notifié quand la liste des entrées change (branchement / débranchement). */
export function sabonnerEntreesMidi(cb: () => void): () => void {
  entreesCbs.add(cb);
  return () => entreesCbs.delete(cb);
}
