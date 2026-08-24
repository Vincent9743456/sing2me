/**
 * CHANGER L'ADRESSE E-MAIL DU COMPTE (b405, demande de Vincent : « je
 * souhaite basculer mon compte sur vincent@mojosong.com » — et que ce soit
 * une fonctionnalité pour tout utilisateur).
 *
 * Le COMPTE ne change pas, seule son adresse de connexion change :
 * bibliothèque, groupes, lives, page publique et plan suivent tout seuls.
 * C'est exactement le piège que cet écran évite : se déconnecter pour se
 * reconnecter avec la nouvelle adresse aurait créé un compte NEUF et vide
 * (b259 — deux comptes ne fusionnent pas).
 *
 * Supabase envoie un code de confirmation à la NOUVELLE adresse ; quand la
 * double confirmation est active (« Secure email change », le défaut), un
 * second code part à l'adresse ACTUELLE. Les deux se saisissent ici, dans
 * n'importe quel ordre. Un lien cliqué dans l'email fonctionne aussi
 * (retour par le hash, comme le lien magique) — mais le CODE reste le
 * chemin fiable de l'app installée : iOS ouvre les liens dans Safari, pas
 * dans l'app (même raison que la connexion par code).
 */
import React, { useState } from 'react';

import { useToast } from './Feedback';
import { Modal } from './ui';
import {
  demanderChangementEmail,
  verifierChangementEmail,
} from '../lib/auth';
import { t } from '../i18n';

export function ChangeEmailModal({
  actuelle,
  onClose,
}: {
  /** Adresse de connexion actuelle du compte. */
  actuelle: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [etape, setEtape] = useState<'saisie' | 'codes'>('saisie');
  const [nouvelle, setNouvelle] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Un des deux codes est déjà accepté (double confirmation). */
  const [premierOk, setPremierOk] = useState(false);

  const adresseValide = /^\S+@\S+\.\S+$/.test(nouvelle.trim());

  async function demander() {
    if (busy || !adresseValide) return;
    if (nouvelle.trim().toLowerCase() === actuelle.trim().toLowerCase()) {
      setMsg(t('C’est déjà l’adresse de ton compte.'));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await demanderChangementEmail(nouvelle.trim());
      setEtape('codes');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('La demande a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  async function verifier() {
    if (busy || code.trim() === '') return;
    setBusy(true);
    setMsg(null);
    try {
      const resultat = await verifierChangementEmail(
        actuelle,
        nouvelle.trim(),
        code,
      );
      if (resultat === 'termine') {
        toast.show(
          t('✓ Ton adresse est maintenant {email}.', { email: nouvelle.trim() }),
        );
        onClose();
        return;
      }
      // Double confirmation : le premier code est accepté, l'autre adresse
      // en a reçu un aussi — on le dit au lieu de laisser croire à un échec.
      setPremierOk(true);
      setCode('');
      setMsg(
        t(
          'Premier code accepté ✓ — saisis maintenant celui reçu sur l’autre adresse.',
        ),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('La vérification a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Changer mon adresse e-mail')} onClose={onClose}>
      {etape === 'saisie' ? (
        <>
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'Ton compte reste le même : morceaux, groupes, setlists, page publique et abonnement suivent. Seule l’adresse de connexion change.',
            )}
          </p>
          <div className="field">
            <label>{t('Adresse actuelle')}</label>
            <input type="email" value={actuelle} disabled />
          </div>
          <div className="field">
            <label>{t('Nouvelle adresse')}</label>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={t('prenom@exemple.com')}
              value={nouvelle}
              onChange={(e) => setNouvelle(e.target.value)}
            />
          </div>
          {msg && (
            <p className="help" style={{ color: 'var(--warn)' }}>
              {msg}
            </p>
          )}
          <button
            className="btn block"
            disabled={busy || !adresseValide}
            onClick={() => void demander()}
          >
            {busy ? '…' : t('Envoyer la confirmation')}
          </button>
        </>
      ) : (
        <>
          <p className="help" style={{ marginTop: 0 }}>
            {premierOk
              ? t('Il reste un code à saisir : celui reçu sur l’autre adresse.')
              : t(
                  'Un code vient d’être envoyé à {email}. Si un second code arrive aussi sur ton adresse actuelle, saisis les deux, l’un après l’autre — pense aux spams.',
                  { email: nouvelle.trim() },
                )}
          </p>
          <div className="field">
            <label>{t('Code reçu par e-mail')}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {msg && (
            <p className="help" style={{ color: 'var(--warn)' }}>
              {msg}
            </p>
          )}
          <button
            className="btn block"
            disabled={busy || code.trim() === ''}
            onClick={() => void verifier()}
          >
            {busy ? '…' : t('Valider le code')}
          </button>
          <button className="btn ghost block" onClick={onClose}>
            {t('Terminer plus tard')}
          </button>
        </>
      )}
    </Modal>
  );
}
