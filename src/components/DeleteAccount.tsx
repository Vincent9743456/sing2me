/**
 * SUPPRIMER SON COMPTE (b261, demande de Vincent : « c'est important pour
 * les utilisateurs de pouvoir supprimer toutes les données »).
 *
 * Un acte irréversible se juge sur trois choses, et pas une de moins :
 *
 *  1. **On dit ce qui va disparaître, avec des chiffres.** Pas « toutes tes
 *     données » — le nombre de groupes qui seront dissous POUR LES AUTRES,
 *     l'adresse publique qui redeviendra libre (et le QR imprimé qui ne
 *     mènera plus nulle part). L'inventaire vient du SERVEUR : ce qu'il
 *     annonce est ce qu'il effacera.
 *  2. **On demande à taper son adresse e-mail**, pas un « oui ». Avec deux
 *     comptes sur le même téléphone (le cas de Vincent), c'est la seule
 *     barrière qui empêche d'effacer le mauvais.
 *  3. **On laisse partir avec ses affaires.** L'export de sauvegarde est
 *     rappelé juste au-dessus du bouton : effacer son compte ne doit pas
 *     obliger à perdre son travail.
 */
import React, { useEffect, useState } from 'react';

import { ConfirmSheet } from './Feedback';
import { getValidSession, signOut } from '../lib/auth';
import { t } from '../i18n';

interface Inventaire {
  groupes: string[];
  adresse: string;
  adhesions: number;
}

/** Efface TOUT ce que l'app garde sur cet appareil. */
function viderLAppareil(): void {
  try {
    const aJeter: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sing2me/')) aJeter.push(k);
    }
    for (const k of aJeter) localStorage.removeItem(k);
  } catch {
    // stockage indisponible : le compte est effacé côté serveur de toute façon
  }
}

export function DeleteAccount({ email }: { email: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [saisie, setSaisie] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // L'inventaire est demandé au SERVEUR à l'ouverture : ce qu'il annonce est
  // ce qu'il effacera. Un décompte calculé côté app pourrait mentir.
  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    void (async () => {
      try {
        const s = await getValidSession();
        if (!s) return;
        const r = await fetch('/api/fan?fn=account', {
          headers: { authorization: `Bearer ${s.accessToken}` },
        });
        if (!r.ok) return;
        const data = (await r.json()) as Inventaire;
        if (!annule) setInv(data);
      } catch {
        // sans inventaire, on reste sur l'avertissement général
      }
    })();
    return () => {
      annule = true;
    };
  }, [ouvert]);

  async function supprimer() {
    setBusy(true);
    setErreur(null);
    try {
      const s = await getValidSession();
      if (!s) throw new Error(t('Connexion requise'));
      const r = await fetch('/api/fan?fn=account', {
        method: 'POST',
        headers: { authorization: `Bearer ${s.accessToken}` },
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? t('Suppression impossible.'));
      // Le compte n'existe plus : on efface aussi cet appareil, sinon sa
      // bibliothèque remonterait au prochain compte qui se connecte ici.
      // Le drapeau fait refaire le ménage AU DÉMARRAGE (`main.tsx`) : entre
      // l'effacement et le rechargement, les composants encore montés
      // réécrivent (le store enregistre en différé) — sans lui, des clés
      // survivraient à la suppression.
      try {
        sessionStorage.setItem('dodosongs:compteSupprime', '1');
      } catch {
        // pas de sessionStorage : le nettoyage ci-dessous reste tenté
      }
      viderLAppareil();
      signOut();
      location.replace(location.origin);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('Suppression impossible.'));
      setBusy(false);
    }
  }

  const saisieOk = saisie.trim().toLowerCase() === email.trim().toLowerCase();

  if (!ouvert) {
    return (
      <button className="btn ghost block" onClick={() => setOuvert(true)}>
        {t('Supprimer mon compte…')}
      </button>
    );
  }

  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 650 }}>
        {t('Supprimer le compte {email}', { email })}
      </p>
      <p className="help">
        {t(
          'Tout ce que ce compte contient sera effacé de nos serveurs, définitivement : ta bibliothèque en ligne, ton profil, tes directs et ce qu’ils ont produit.',
        )}
      </p>

      {/* Les conséquences pour LES AUTRES, chiffrées. C'est la partie qu'on
          ne peut pas deviner soi-même, et la seule qui soit irréparable
          pour quelqu'un d'autre que soi. */}
      {inv !== null && (
        <>
          {inv.groupes.length > 0 && (
            <p className="help" style={{ color: 'var(--warn)' }}>
              {inv.groupes.length === 1
                ? t(
                    '⚠ Le groupe « {noms} » sera DISSOUS pour tous ses musiciens — répertoire et discussions compris. Pour l’éviter, transmets-le d’abord à un membre depuis sa fiche.',
                    { noms: inv.groupes.join(', ') },
                  )
                : t(
                    '⚠ {n} groupes seront DISSOUS pour tous leurs musiciens ({noms}) — répertoires et discussions compris. Pour l’éviter, transmets-les d’abord à un membre depuis leur fiche.',
                    { n: inv.groupes.length, noms: inv.groupes.join(', ') },
                  )}
            </p>
          )}
          {inv.adresse !== '' && (
            <p className="help" style={{ color: 'var(--warn)' }}>
              {t(
                '⚠ Ton adresse publique « {adresse} » sera libérée : les QR déjà imprimés ne mèneront plus à toi.',
                { adresse: inv.adresse },
              )}
            </p>
          )}
          {inv.adhesions > 0 && (
            <p className="help">
              {t(
                'Tu quitteras aussi {n} groupe(s) dont tu es membre — ceux-là continuent d’exister sans toi.',
                { n: inv.adhesions },
              )}
            </p>
          )}
        </>
      )}

      <p className="help">
        {t(
          'Avant d’effacer : exporte ta sauvegarde (plus haut sur cet écran) si tu veux garder tes partitions.',
        )}
      </p>

      <label className="help" style={{ display: 'block' }}>
        {t('Pour confirmer, écris ton adresse : {email}', { email })}
      </label>
      <input
        type="email"
        value={saisie}
        autoComplete="off"
        placeholder={email}
        onChange={(e) => setSaisie(e.target.value)}
      />
      {erreur !== null && (
        <p className="help" style={{ color: 'var(--danger)' }}>
          {erreur}
        </p>
      )}
      <div className="spacer" />
      <div className="rowactions">
        <button
          className="btn danger"
          disabled={!saisieOk || busy}
          onClick={() => setConfirme(true)}
        >
          {busy ? '…' : t('Supprimer définitivement')}
        </button>
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => {
            setOuvert(false);
            setSaisie('');
            setErreur(null);
          }}
        >
          {t('Annuler')}
        </button>
      </div>

      {confirme && (
        <ConfirmSheet
          title={t('Supprimer définitivement le compte {email} ?', { email })}
          message={t(
            'Il n’y a pas de retour en arrière, et rien ne peut être restauré ensuite.',
          )}
          confirmLabel={t('Supprimer définitivement')}
          danger
          onConfirm={() => {
            setConfirme(false);
            void supprimer();
          }}
          onClose={() => setConfirme(false)}
        />
      )}
    </div>
  );
}
