/**
 * Tableau de bord fondateur (#/tableau-de-bord, b160) — réservé aux
 * comptes listés dans ADMIN_EMAILS côté serveur. Ce n'est PAS un écran
 * de l'app musicien : il n'apparaît que pour qui y a droit, et tout le
 * filtrage est fait par le serveur (l'app ne fait qu'afficher).
 *
 * Ce qu'on montre : comptes, activité, et surtout le coût des IA — mesuré
 * par nous à chaque appel, puisque ni Anthropic ni OpenAI n'exposent le
 * solde restant. Le restant estimé = rechargements saisis − dépense
 * mesurée.
 */
import React, { useEffect, useState } from 'react';

import { MenuSheet, PromptSheet, useToast } from '../components/Feedback';
import { Empty, TopBar } from '../components/ui';
import { t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { navigate } from '../router';

/** Ligne de la vue par utilisateur (b485, demande de Marco). */
interface LigneUtilisateur {
  id: string;
  email: string;
  cree: string | null;
  vu: string | null;
  plan: string;
  /** null tant qu'admin.sql (admin_user_songs) n'est pas rejoué. */
  morceaux: number | null;
  synchro: string | null;
  lives: number;
  dernierLive: string | null;
  /** b498 — null tant que live.sql (mesure des lives) n'est pas rejoué. */
  pic?: number | null;
  sallePleine?: boolean;
}

interface Stats {
  at: string;
  accounts: {
    total: number;
    new7: number;
    new30: number;
    active7: number;
    active30: number;
  };
  /** Vue par utilisateur (b485) — absente sur un serveur pas à jour. */
  utilisateurs?: LigneUtilisateur[];
  morceauxParCompte?: boolean;
  enDirect?: {
    artiste: string;
    depuis: string | null;
    statut: string;
    spectateurs: number;
  }[];
  /** Répartition des abonnements (b411) — les gratuits = total − le reste. */
  plans?: { musicien: number; scene: number; admin: number };
  bands: number;
  lives: number;
  /** Partitions des bibliothèques perso — null si admin.sql pas rejoué. */
  songs?: { total: number; uniques: number } | null;
  ai: {
    last30: {
      total: number;
      calls: number;
      byProvider: Record<string, number>;
      byFn: Record<string, number>;
    };
    allTime: {
      total: number;
      calls: number;
      byProvider: Record<string, number>;
    };
  };
  billing: {
    remaining: Record<string, { paid: number; used: number; left: number }>;
    lastTopups: { provider: string; amount_usd: number; at: string }[];
  };
  revenue: null | number;
  measurement?: {
    ready: boolean;
    aiUsage?: { ok: boolean; status?: number; detail?: string };
    topups?: { ok: boolean; status?: number; detail?: string };
  };
}

/**
 * Affichage des montants EN EUROS, deux décimales (b163, demande
 * Vincent) : pas de dixièmes ni de centièmes de centime — une dépense
 * plus petite qu'un centime s'affiche « 0,00 € », ce qui dit exactement
 * ce qu'il faut comprendre : elle est négligeable.
 *
 * Les fournisseurs facturent en dollars ; on convertit à un taux fixe,
 * défini ici et nulle part ailleurs. Il n'a pas besoin d'être au jour le
 * jour : à ces montants, l'écart est sans effet sur une décision.
 */
const USD_TO_EUR = 0.92;

const eur = (usdAmount: number) =>
  `${(usdAmount * USD_TO_EUR).toFixed(2).replace('.', ',')} €`;

const FN_LABEL: Record<string, string> = {
  note: 'Notes de répétition',
  transcribe: 'Dictée (transcription)',
  clean: 'Nettoyage de partitions',
  setlist: 'Setlists par IA',
};

/** Étiquettes des plans (b485) — traduites au rendu. */
const PLAN_LABEL: Record<string, string> = {
  free: 'gratuit',
  musicien: 'musicien',
  scene: 'scène',
  admin: 'fondateur',
};

/** Date compacte « 31/08 09:12 » — locale du lecteur, '—' si inconnue. */
function quand(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * DERNIERS CHIFFRES CONNUS (b455, « le chargement est assez long »,
 * Vincent) — même réflexe que l'historique des lives (b343) : l'écran
 * affiche immédiatement ce qu'on a su la dernière fois, et rafraîchit en
 * silence derrière. Le gros du délai est incompressible côté serveur
 * (réveil de la fonction, huit lectures Supabase) ; ce qui se corrige,
 * c'est l'ATTENTE devant un écran vide. Un cache local ne conclut jamais
 * à l'absence (règle b245) : il ne sert qu'à montrer plus vite.
 */
const CACHE_ADMIN = 'sing2me/adminCache';
function statsLues(): Stats | null {
  try {
    const raw = localStorage.getItem(CACHE_ADMIN);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Stats>;
    if (c?.accounts == null || c?.ai?.last30 == null) return null;
    return c as Stats;
  } catch {
    return null;
  }
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(() => statsLues());
  const [error, setError] = useState<string | null>(null);
  const [topup, setTopup] = useState<'anthropic' | 'openai' | null>(null);
  // b497 (demande de Vincent) : changer le PLAN d'un compte depuis la
  // vue utilisateurs — feuille de choix, écrit user_plans côté serveur.
  const [planPour, setPlanPour] = useState<LigneUtilisateur | null>(null);
  const toast = useToast();

  // Un rafraîchissement qui échoue ne remplace JAMAIS des chiffres déjà
  // affichés par un message d'erreur (b455, même règle que b343) :
  // l'erreur ne se montre que quand il n'y a rien à montrer.
  function echec(msg: string) {
    if (statsLues() === null) setError(msg);
  }

  async function load() {
    setError(null);
    try {
      const s = await getValidSession();
      if (!s) {
        echec(t('Il faut être connecté.'));
        return;
      }
      const r = await fetch('/api/admin-stats', {
        headers: { authorization: `Bearer ${s.accessToken}` },
      });
      const type = r.headers.get('content-type') ?? '';
      if (!type.includes('application/json')) {
        echec(t('Tableau de bord indisponible — nécessite la version en ligne.'));
        return;
      }
      const body = await r.json();
      if (!r.ok) {
        echec(body?.error ?? `Erreur ${r.status}`);
        return;
      }
      // Réponse inattendue (proxy, ancienne version du serveur, panne
      // partielle) : on affiche une erreur plutôt que de planter l'écran.
      if (
        body?.accounts == null ||
        body?.ai?.last30 == null ||
        body?.billing?.remaining == null
      ) {
        echec(t('Réponse inattendue du serveur — chiffres indisponibles.'));
        return;
      }
      setStats(body as Stats);
      try {
        localStorage.setItem(CACHE_ADMIN, JSON.stringify(body));
      } catch {
        /* stockage indisponible : l'affichage direct suffit */
      }
    } catch {
      echec(t('Impossible de charger les chiffres.'));
    }
  }

  useEffect(() => {
    void load();
    // Rafraîchissement en direct, sans être bavard.
    const id = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveTopup(provider: 'anthropic' | 'openai', value: string) {
    const euros = Number(value.replace(',', '.'));
    if (!(euros > 0)) return;
    // Saisie en euros, stockage en dollars (unité de facturation des
    // fournisseurs) : une seule conversion, au même taux que l'affichage.
    const amount = euros / USD_TO_EUR;
    const s = await getValidSession();
    if (!s) return;
    const r = await fetch('/api/admin-stats', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider, amount_usd: amount }),
    });
    if (r.ok) {
      toast.show(t('Rechargement noté ✓'));
      void load();
    } else {
      // On répète la raison donnée par le serveur (table absente…) plutôt
      // qu'un échec muet.
      const body = await r.json().catch(() => null);
      setError(body?.error ?? t("Le rechargement n'a pas pu être noté."));
    }
  }

  async function changerPlan(u: LigneUtilisateur, plan: string) {
    const s = await getValidSession();
    if (!s) return;
    const r = await fetch('/api/admin-stats', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'setPlan', user_id: u.id, plan }),
    });
    if (r.ok) {
      toast.show(t('Plan changé ✓'));
      void load();
    } else {
      const body = await r.json().catch(() => null);
      setError(body?.error ?? t("Le plan n'a pas pu être changé."));
    }
  }

  return (
    <>
      <TopBar
        live={false}
        title={t('Tableau de bord')}
        onBack={() => navigate('/artist')}
      />
      <div className="page">
        {error !== null && (
          <Empty>
            {error}
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => void load()}>
              {t('Réessayer')}
            </button>
          </Empty>
        )}
        {error === null && stats === null && (
          <p className="help">{t('Chargement des chiffres…')}</p>
        )}

        {stats !== null && (
          <>
            {/* Diagnostic (b161) : sans les tables, tout reste à zéro en
                silence — on le dit, avec le geste qui répare. */}
            {stats.measurement && !stats.measurement.ready && (
              <div
                className="card"
                style={{ borderColor: 'var(--danger)', marginBottom: 12 }}
              >
                <strong>{t('La mesure des coûts n’est pas active.')}</strong>
                <p className="help" style={{ marginBottom: 0 }}>
                  {t(
                    'Les tables de mesure sont absentes : exécute supabase/admin.sql dans le SQL Editor de Supabase. Tant qu’elles manquent, la dépense reste à zéro et les rechargements ne peuvent pas être notés.',
                  )}
                </p>
              </div>
            )}
            {stats.measurement?.ready && stats.ai.allTime.calls === 0 && (
              <p className="help">
                {t(
                  'La mesure vient de démarrer : seuls les appels IA passés à partir de maintenant sont comptés. Ce que tu as consommé avant n’apparaît que dans les consoles Anthropic et OpenAI.',
                )}
              </p>
            )}

            {/* KPI resserrés (b411, liste de Vincent) : comptes avec la
                répartition des abonnements, actifs, connectés 7 j ;
                groupes, partitions uniques (hors copies de groupe), lives.
                « Morceaux partagés en groupe » est retiré — pas à jour,
                pas utile. */}
            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              {t('Musiciens')}
            </h2>
            <div className="statgrid">
              <Stat label={t('Comptes créés')} value={stats.accounts.total} />
              <Stat label={t('Actifs (30 j)')} value={stats.accounts.active30} />
              <Stat label={t('Connectés (7 j)')} value={stats.accounts.active7} />
            </div>
            {stats.plans && (
              <p className="help" style={{ marginTop: -4 }}>
                {t(
                  'Abonnements : {free} gratuits · {musicien} musicien · {scene} scène · {admin} fondateurs',
                  {
                    free: Math.max(
                      0,
                      stats.accounts.total -
                        stats.plans.musicien -
                        stats.plans.scene -
                        stats.plans.admin,
                    ),
                    musicien: stats.plans.musicien,
                    scene: stats.plans.scene,
                    admin: stats.plans.admin,
                  },
                )}
              </p>
            )}

            {/* LIVES EN COURS (b485, demande de Marco : « les lives qui
                sont faits… personnes connectées ») : qui joue là, tout de
                suite, avec la jauge de salle — même définition qu'api/live
                (siège vu depuis moins de 2 min). */}
            {stats.enDirect && stats.enDirect.length > 0 && (
              <>
                <h2 className="pagetitle">{t('En live maintenant')}</h2>
                <div className="list">
                  {stats.enDirect.map((l, i) => (
                    <div className="row" key={i} style={{ cursor: 'default' }}>
                      <div className="grow">
                        <div className="title">
                          {l.statut === 'paused' ? '⏸' : '🔴'}{' '}
                          {l.artiste !== '' ? l.artiste : t('(sans nom)')}
                        </div>
                        <div className="sub">
                          {t('depuis {heure}', { heure: quand(l.depuis) })}
                        </div>
                      </div>
                      <span style={{ fontWeight: 700 }}>
                        {l.spectateurs > 1
                          ? t('{n} spectateurs', { n: l.spectateurs })
                          : t('{n} spectateur', { n: l.spectateurs })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* VUE PAR UTILISATEUR (b485, demande de Marco : « voir les
                utilisateurs, leur abonnement, dernière connexion, nb de
                morceaux, nb de lives »). Nominatif — cet écran est déjà
                réservé aux fondateurs, le serveur tranche (b160). */}
            {stats.utilisateurs && (
              <>
                <h2 className="pagetitle">{t('Utilisateurs')}</h2>
                {stats.morceauxParCompte !== true && (
                  <p className="help" style={{ marginTop: -4 }}>
                    {t(
                      'Morceaux et synchro par compte indisponibles — exécute supabase/admin.sql dans le SQL Editor (fonction admin_user_songs).',
                    )}
                  </p>
                )}
                <div className="list">
                  {stats.utilisateurs.map((u) => (
                    <div className="row" key={u.id} style={{ cursor: 'default' }}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="title">
                          {u.email !== '' ? u.email : u.id.slice(0, 8)}
                          <span
                            className="stauthor"
                            style={
                              u.plan !== 'free'
                                ? { color: 'var(--accent)' }
                                : undefined
                            }
                          >
                            {' '}
                            · {t(PLAN_LABEL[u.plan] ?? u.plan)}
                          </span>
                        </div>
                        <div className="sub">
                          {t('connexion {q}', { q: quand(u.vu) })}
                          {' · '}
                          {t('synchro {q}', { q: quand(u.synchro) })}
                          {' · '}
                          {u.morceaux === null
                            ? t('morceaux : —')
                            : u.morceaux > 1
                              ? t('{n} morceaux', { n: u.morceaux })
                              : t('{n} morceau', { n: u.morceaux })}
                          {' · '}
                          {u.lives > 1
                            ? t('{n} lives', { n: u.lives })
                            : t('{n} live', { n: u.lives })}
                          {u.dernierLive !== null
                            ? ` (${t('dernier {q}', { q: quand(u.dernierLive) })})`
                            : ''}
                          {/* b498 : pic de spectateurs le plus élevé, et
                              mention si une salle a été pleine — seulement
                              quand il y a eu des lives à mesurer. */}
                          {u.lives > 0 && u.pic != null
                            ? ' · ' + t('pic {n}', { n: u.pic })
                            : ''}
                          {u.sallePleine === true && (
                            <span style={{ color: 'var(--warn)' }}>
                              {' · '}
                              {t('🔴 salle pleine')}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn ghost small"
                        style={{ flexShrink: 0 }}
                        title={t('Changer le plan de ce compte')}
                        onClick={() => setPlanPour(u)}
                      >
                        {t('Plan…')}
                      </button>
                    </div>
                  ))}
                  {stats.utilisateurs.length === 0 && (
                    <p className="help">{t('Aucun compte pour l’instant.')}</p>
                  )}
                </div>
              </>
            )}

            <h2 className="pagetitle">{t('Usage')}</h2>
            <div className="statgrid">
              <Stat label={t('Groupes')} value={stats.bands} />
              <Stat
                label={t('Partitions (uniques)')}
                value={stats.songs ? stats.songs.uniques : '—'}
              />
              <Stat label={t('Lives lancés')} value={stats.lives} />
            </div>
            {stats.songs ? (
              <p className="help" style={{ marginTop: -4 }}>
                {t(
                  '{total} partitions en comptant les copies des répertoires de groupe.',
                  { total: stats.songs.total },
                )}
              </p>
            ) : (
              <p className="help" style={{ marginTop: -4 }}>
                {t(
                  'Compteur de partitions indisponible — exécute supabase/admin.sql dans le SQL Editor (fonction admin_song_stats).',
                )}
              </p>
            )}

            <h2 className="pagetitle">{t('Coût des IA (30 derniers jours)')}</h2>
            <div className="statgrid">
              <Stat label={t('Total')} value={eur(stats.ai.last30.total)} />
              <Stat label={t('Appels')} value={stats.ai.last30.calls} />
            </div>
            {stats.ai.last30.calls > 0 && (
              <p className="help" style={{ marginTop: -6 }}>
                {t('À ce rythme : environ {mois} par mois pour 100 appels.', {
                  mois: eur((stats.ai.last30.total / stats.ai.last30.calls) * 100),
                })}
              </p>
            )}
            <div className="list">
              {Object.entries(stats.ai.last30.byFn)
                .sort((a, b) => b[1] - a[1])
                .map(([fn, cost]) => (
                  <div className="row" key={fn} style={{ cursor: 'default' }}>
                    <div className="grow">
                      <div className="title">{t(FN_LABEL[fn] ?? fn)}</div>
                    </div>
                    <span className="stauthor">{eur(cost)}</span>
                  </div>
                ))}
              {Object.keys(stats.ai.last30.byFn).length === 0 && (
                <p className="help">
                  {t('Aucun appel IA sur la période — rien à facturer.')}
                </p>
              )}
            </div>

            <h2 className="pagetitle">{t('Crédit restant (estimé)')}</h2>
            <p className="help" style={{ marginTop: -4 }}>
              {t(
                'Ni Anthropic ni OpenAI ne publient le solde restant. Il est reconstitué ici : ce que tu as rechargé, moins ce que l’app a réellement consommé.',
              )}
            </p>
            {(['anthropic', 'openai'] as const).map((p) => {
              const r = stats.billing.remaining[p];
              const low = r && r.paid > 0 && r.left < r.paid * 0.2;
              return (
                <div className="row" key={p} style={{ cursor: 'default' }}>
                  <div className="grow">
                    <div className="title">
                      {p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (dictée)'}
                      {low && <span className="stauthor"> — {t('à recharger')}</span>}
                    </div>
                    <div className="sub">
                      {t('Rechargé {paid} · consommé {used}', {
                        paid: eur(r?.paid ?? 0),
                        used: eur(r?.used ?? 0),
                      })}
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: low ? 'var(--danger)' : 'var(--text)',
                    }}
                  >
                    {eur(Math.max(0, r?.left ?? 0))}
                  </span>
                  <button
                    className="btn ghost small"
                    onClick={() => setTopup(p)}
                    style={{ marginLeft: 8 }}
                  >
                    {t('+ Recharge')}
                  </button>
                </div>
              );
            })}

            <h2 className="pagetitle">{t('Chiffre d’affaires')}</h2>
            <p className="help">
              {t(
                'En attente du modèle économique (Licence Scène). Rien n’est affiché tant que les montants ne sont pas arrêtés.',
              )}
            </p>

            <div className="spacer" />
            <p className="help">
              {t('Chiffres au {heure} — actualisés chaque minute.', {
                heure: new Date(stats.at).toLocaleTimeString(),
              })}
            </p>
          </>
        )}
      </div>

      {planPour !== null && (
        <MenuSheet
          title={t('Plan de {email}', {
            email: planPour.email || planPour.id.slice(0, 8),
          })}
          onClose={() => setPlanPour(null)}
          items={['free', 'musicien', 'scene', 'admin'].map((p) => ({
            label:
              (planPour.plan === p ? '✓ ' : '') + t(PLAN_LABEL[p] ?? p),
            onClick: () => {
              if (planPour.plan !== p) void changerPlan(planPour, p);
            },
          }))}
        />
      )}
      {topup !== null && (
        <PromptSheet
          title={
            topup === 'anthropic'
              ? t('Recharge Anthropic')
              : t('Recharge OpenAI')
          }
          message={t('Montant en euros, tel que tu viens de le payer.')}
          placeholder="10"
          confirmLabel={t('Noter le rechargement')}
          onSubmit={(v) => void saveTopup(topup, v)}
          onClose={() => setTopup(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="statcard">
      <div className="statvalue">{value}</div>
      <div className="statlabel">{label}</div>
    </div>
  );
}
