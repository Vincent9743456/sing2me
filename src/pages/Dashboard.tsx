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

import { PromptSheet, useToast } from '../components/Feedback';
import { Empty, TopBar } from '../components/ui';
import { t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { navigate } from '../router';

interface Stats {
  at: string;
  accounts: {
    total: number;
    new7: number;
    new30: number;
    active7: number;
    active30: number;
  };
  bands: number;
  lives: number;
  songsShared: number;
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

const usd = (n: number) =>
  n >= 1 ? `${n.toFixed(2)} $` : `${(n * 100).toFixed(1)} ¢`;

const FN_LABEL: Record<string, string> = {
  note: 'Notes de répétition',
  transcribe: 'Dictée (transcription)',
  clean: 'Nettoyage de partitions',
  setlist: 'Setlists par IA',
};

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topup, setTopup] = useState<'anthropic' | 'openai' | null>(null);
  const toast = useToast();

  async function load() {
    setError(null);
    try {
      const s = await getValidSession();
      if (!s) {
        setError(t('Il faut être connecté.'));
        return;
      }
      const r = await fetch('/api/admin-stats', {
        headers: { authorization: `Bearer ${s.accessToken}` },
      });
      const type = r.headers.get('content-type') ?? '';
      if (!type.includes('application/json')) {
        setError(t('Tableau de bord indisponible — nécessite la version en ligne.'));
        return;
      }
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? `Erreur ${r.status}`);
        return;
      }
      // Réponse inattendue (proxy, ancienne version du serveur, panne
      // partielle) : on affiche une erreur plutôt que de planter l'écran.
      if (
        body?.accounts == null ||
        body?.ai?.last30 == null ||
        body?.billing?.remaining == null
      ) {
        setError(t('Réponse inattendue du serveur — chiffres indisponibles.'));
        return;
      }
      setStats(body as Stats);
    } catch {
      setError(t('Impossible de charger les chiffres.'));
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
    const amount = Number(value.replace(',', '.'));
    if (!(amount > 0)) return;
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

            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              {t('Musiciens')}
            </h2>
            <div className="statgrid">
              <Stat label={t('Comptes créés')} value={stats.accounts.total} />
              <Stat label={t('Actifs (30 j)')} value={stats.accounts.active30} />
              <Stat label={t('Nouveaux (7 j)')} value={stats.accounts.new7} />
              <Stat label={t('Connectés (7 j)')} value={stats.accounts.active7} />
            </div>

            <h2 className="pagetitle">{t('Usage')}</h2>
            <div className="statgrid">
              <Stat label={t('Groupes')} value={stats.bands} />
              <Stat label={t('Directs lancés')} value={stats.lives} />
              <Stat
                label={t('Morceaux partagés en groupe')}
                value={stats.songsShared}
              />
            </div>

            <h2 className="pagetitle">{t('Coût des IA (30 derniers jours)')}</h2>
            <div className="statgrid">
              <Stat label={t('Total')} value={usd(stats.ai.last30.total)} />
              <Stat label={t('Appels')} value={stats.ai.last30.calls} />
            </div>
            <div className="list">
              {Object.entries(stats.ai.last30.byFn)
                .sort((a, b) => b[1] - a[1])
                .map(([fn, cost]) => (
                  <div className="row" key={fn} style={{ cursor: 'default' }}>
                    <div className="grow">
                      <div className="title">{t(FN_LABEL[fn] ?? fn)}</div>
                    </div>
                    <span className="stauthor">{usd(cost)}</span>
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
                        paid: usd(r?.paid ?? 0),
                        used: usd(r?.used ?? 0),
                      })}
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: low ? 'var(--danger)' : 'var(--text)',
                    }}
                  >
                    {usd(Math.max(0, r?.left ?? 0))}
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

      {topup !== null && (
        <PromptSheet
          title={
            topup === 'anthropic'
              ? t('Recharge Anthropic')
              : t('Recharge OpenAI')
          }
          message={t('Montant en dollars, tel que tu viens de le payer.')}
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
