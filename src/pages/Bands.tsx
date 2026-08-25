/**
 * Onglet Groupes : tous tes groupes au premier niveau — leur fiche,
 * leur espace de discussion, et la création en un geste.
 */
import { LiveBanner } from '../components/LiveBanner';
import React, { useEffect, useState } from 'react';

import { useAccount } from '../components/Account';
import { ConfirmSheet, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { SwipeRow } from '../components/SwipeRow';
import { useNotifications } from '../components/Notifications';
import { Empty, Field, HeaderPlus, TopBar } from '../components/ui';
import { t } from '../i18n';
import { getValidSession, monId } from '../lib/auth';
import {
  BandDeparture,
  departureKey,
  departuresToShow,
  fetchBandDepartures,
  fetchMyInvites,
  inviteToBand,
  PendingInvite,
  respondInvite,
} from '../lib/bands';
import { detacherDuCloud, texteSuppression } from '../lib/deleteband';
import {
  appliquerMasquage,
  ECHEC_MASQUAGE,
  groupeMasque,
} from '../lib/masquagegroupe';
import { creatorMember } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { Band, emptyBand } from '../types';

export function Bands() {
  const { bands, artist, prefs, saveBand, savePrefs, deleteBand } = useStore();
  const account = useAccount();
  const notifications = useNotifications();
  const toast = useToast();

  /**
   * L'ŒIL DE LA LIGNE AGIT EN LIGNE (b282). Le drapeau local part d'abord —
   * c'est lui qui interdit déjà le direct au nom du groupe, et il ne doit
   * dépendre d'aucun réseau. La page publique suit dans la foulée ; si elle
   * ne suit pas, on le DIT.
   */
  function basculerMasquage(band: Band) {
    const masque = band.hiddenFromPublic !== true;
    saveBand(groupeMasque(band, masque));
    void (async () => {
      const { ok } = await appliquerMasquage(
        band,
        masque,
        bands,
        artist,
        prefs.pagePubliqueMasquee === true,
      );
      if (!ok) {
        toast.show(t(ECHEC_MASQUAGE));
        // Rejoué à la prochaine synchro : un réglage de vie privée n'attend
        // pas un enregistrement de profil qui ne viendra peut-être jamais.
        savePrefs({ ...prefs, ficheARepublier: true });
      }
    })();
  }
  const [creating, setCreating] = useState(false);
  /** Groupe dont la suppression est demandée, en attente de confirmation. */
  const [aSupprimer, setASupprimer] = useState<Band | null>(null);
  const [newName, setNewName] = useState('');
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  // Musiciens partis de MES groupes, à réinviter (b142).
  const [departures, setDepartures] = useState<BandDeparture[]>([]);
  const [reinviteBusy, setReinviteBusy] = useState('');
  const [inviteBusy, setInviteBusy] = useState('');
  // Mon identifiant de compte : un départ qui me désigne MOI n'appelle
  // aucune action (b212).
  const [myId, setMyId] = useState('');
  const aTraiter = departuresToShow(departures, {
    myUserId: myId,
    myCloudIds: bands.map((b) => b.cloudId ?? ''),
    hidden: prefs.hiddenDepartures,
  });

  /** Écarte un départ : local, définitif, et jamais destructeur côté
   *  serveur (le musicien peut toujours être réinvité depuis la fiche). */
  function ecarter(d: BandDeparture) {
    savePrefs({
      ...prefs,
      hiddenDepartures: [
        ...new Set([...(prefs.hiddenDepartures ?? []), departureKey(d)]),
      ].slice(-500),
    });
  }

  // Ouvrir l'onglet Groupes = « j'ai vu les arrivées » : on efface cette
  // partie de la pastille (les invitations restent tant qu'on n'a pas répondu).
  const memberNews = notifications.memberNews;
  useEffect(() => {
    if (memberNews.length > 0) notifications.acknowledgeMembers();
    // au montage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invitations reçues (annuaire) : acceptation obligatoire.
  useEffect(() => {
    if (account?.email == null) return;
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (!s || cancelled) return;
      const list = await fetchMyInvites(s);
      if (!cancelled) setInvites(list);
      // Départs à traiter dans MES groupes (b142) : un musicien qui a
      // réinitialisé son application n'a plus le groupe — il faut le
      // réinviter, et ça ne se devine pas.
      const gone = await fetchBandDepartures(s);
      if (!cancelled) {
        setDepartures(gone);
        setMyId(s.userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.email]);

  /** Renvoie la demande à un musicien parti (b142). */
  async function reinvite(d: BandDeparture) {
    setReinviteBusy(d.userId);
    try {
      const s = await getValidSession();
      if (!s) return;
      await inviteToBand(s, d.bandId, d.userId);
      setDepartures((list) => list.filter((x) => x.userId !== d.userId));
    } catch {
      /* silencieux : la carte reste, on pourra réessayer */
    } finally {
      setReinviteBusy('');
    }
  }

  async function respond(inv: PendingInvite, accept: boolean) {
    setInviteBusy(inv.id);
    try {
      const s = await getValidSession();
      if (!s) return;
      await respondInvite(
        s,
        inv.id,
        accept,
        prefs.userName || artist.name || t('Moi'),
        '',
      );
      // Accepter = rejoindre : on crée le groupe en local (le répertoire
      // partagé se synchronise ensuite tout seul).
      if (accept && !bands.some((b) => b.cloudId === inv.band_id)) {
        saveBand({
          ...emptyBand(),
          name: inv.band_name || t('Groupe'),
          // Qui m'a invité = le créateur du groupe (b147).
          ownerName: inv.from_name || '',
          cloudId: inv.band_id,
          owned: false, // j'ai REJOINT ce groupe : je n'en suis pas le créateur
          members: [creatorMember(artist, prefs.userName, monId())],
        });
      }
      setInvites((list) => list.filter((x) => x.id !== inv.id));
      notifications.refresh();
    } catch {
      // best-effort
    } finally {
      setInviteBusy('');
    }
  }

  function cancelCreate() {
    setCreating(false);
    setNewName('');
  }

  function confirmCreate() {
    const b = {
      ...emptyBand(),
      name: newName.trim() || t('Mon groupe'),
      owned: true, // je CRÉE ce groupe : j'en suis le propriétaire
      members: [creatorMember(artist, prefs.userName, monId())],
    };
    saveBand(b);
    cancelCreate();
    navigate(`/band/${b.id}`);
  }

  return (
    <>
      <TopBar
        title={t('Groupes')}
        right={
          <HeaderPlus label={t('Nouveau groupe')} onClick={() => setCreating(true)} />
        }
      />
      <div className="page">
        <LiveBanner />
        {/* Plus aucune limite de groupes (b385, offre v2) : la garde et le
            compteur de b381 sont retirés. */}
        {memberNews.length > 0 && (
          <>
            {memberNews.map((n) => (
              <div
                className="card"
                key={n.key}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderColor: 'var(--accent)',
                }}
              >
                🎉 <strong>{n.memberName}</strong> {t('a rejoint')}{' '}
                <strong>« {n.bandName} »</strong>.
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {/* Un musicien a quitté un de mes groupes (b142) : le plus
            souvent parce qu'il a réinitialisé son application. Il ne
            reviendra pas tout seul — la demande doit être renvoyée. */}
        {aTraiter.length > 0 && (
          <>
            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              {t('À réinviter')}
            </h2>
            {aTraiter.map((d) => (
              <div
                className="card"
                key={`${d.bandId}|${d.userId}`}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderColor: 'var(--accent)',
                }}
              >
                {/* On dit le FAIT, jamais une cause devinée (b415, retour de
                    Vincent : Marco était simplement sorti du groupe, le
                    bandeau affirmait « son application a été
                    réinitialisée »). Le serveur ne sait qu'une chose : il a
                    quitté le groupe. */}
                <div>
                  <strong>{d.name || t('Un musicien')}</strong>{' '}
                  {t('a quitté')}{' '}
                  <strong>« {d.bandName || t('ton groupe')} »</strong>.
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={reinviteBusy === d.userId}
                    onClick={() => void reinvite(d)}
                  >
                    {reinviteBusy === d.userId
                      ? '…'
                      : t('↻ Lui renvoyer la demande')}
                  </button>
                  {/* Une bannière doit toujours avoir une sortie (b212) :
                      on ne réinvite pas forcément, et le message resterait
                      là à vie. Écarter ne retire rien à personne. */}
                  <button className="btn ghost" onClick={() => ecarter(d)}>
                    {t('Ne plus afficher')}
                  </button>
                </div>
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {invites.length > 0 && (
          <>
            <h2 className="pagetitle" style={{ marginTop: 0 }}>
              {t('Invitations reçues')}
            </h2>
            {invites.map((inv) => (
              <div
                className="card"
                key={inv.id}
                style={{ padding: '10px 12px', marginBottom: 8 }}
              >
                <div>
                  <strong>{inv.from_name || t('Un musicien')}</strong>{' '}
                  {t("t'invite à rejoindre")}{' '}
                  <strong>« {inv.band_name || t('un groupe')} »</strong>.
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void respond(inv, true)}
                  >
                    {t('Accepter')}
                  </button>
                  <button
                    className="btn ghost"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void respond(inv, false)}
                  >
                    {t('Refuser')}
                  </button>
                </div>
              </div>
            ))}
            <div className="spacer" />
          </>
        )}
        {bands.length === 0 && !creating ? (
          <Empty>
            {t(
              'Joue à plusieurs : crée ton groupe, invite les autres, et partagez répertoire, setlists et discussions.',
            )}
          </Empty>
        ) : (
          <div className="list">
            {bands.map((band) => (
              /* SUPPRIMER DEPUIS LA LISTE (b254, demande de Vincent) : la
                 corbeille se révèle d'un glissement vers la gauche ou d'un
                 appui long — elle ne traîne pas sur la ligne, où elle se
                 toucherait par erreur. La décision (dissoudre / quitter) est
                 celle de la fiche du groupe, prise au même endroit. */
              <SwipeRow
                key={band.id}
                label={band.name || t('ce groupe')}
                onDelete={() => setASupprimer(band)}
              >
                <div
                  className="hstack grow"
                  style={{ cursor: 'pointer', gap: 10 }}
                  onClick={() => navigate(`/band/${band.id}`)}
                >
                  {band.photo !== '' ? (
                    <img
                      src={band.photo}
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '1.4rem' }}>👥</span>
                  )}
                  <div className="grow">
                    <div className="title">
                      {band.name || t('(sans nom)')}
                    </div>
                    {/* JUSTE « public » ou « privé » (b309, demande de
                        Vincent : « ne pas mettre l'info sur le nombre de
                        musiciens »). Le décompte pénalisait l'affichage et se
                        lit déjà dans la fiche du groupe ; ici, la seule chose
                        qui compte d'un coup d'œil est de savoir si le public
                        peut voir ce groupe. */}
                    <div className="sub">
                      {band.hiddenFromPublic === true
                        ? t('privé')
                        : t('public')}
                    </div>
                  </div>
                </div>
                {/* MASQUER / DÉMASQUER SUR LA LIGNE (b228, demande de
                    Vincent : « facile à identifier et à modifier, sans avoir
                    à entrer en modification »). Un appui, ici même, dans les
                    deux sens. L'état se LIT sans rien ouvrir : l'œil est
                    barré quand le groupe est masqué. */}
                <button
                  className="btn ghost small"
                  aria-pressed={band.hiddenFromPublic === true}
                  aria-label={
                    band.hiddenFromPublic === true
                      ? t('Masqué au public — aucun live possible à son nom. Toucher pour le rendre visible.')
                      : t('Visible du public. Toucher pour le masquer.')
                  }
                  title={
                    band.hiddenFromPublic === true
                      ? t('Masqué au public — aucun live possible à son nom. Toucher pour le rendre visible.')
                      : t('Visible du public. Toucher pour le masquer.')
                  }
                  // Cible confortable au doigt : ce bouton décide de ce que
                  // voit le public, il ne se touche pas par erreur.
                  style={{
                    minHeight: 36,
                    ...(band.hiddenFromPublic === true
                      ? { color: 'var(--text-faint)' }
                      : {}),
                  }}
                  onClick={() => basculerMasquage(band)}
                >
                  {band.hiddenFromPublic === true ? '🙈' : '👁'}
                </button>
                <button
                  className="btn ghost small"
                  style={{ minHeight: 36 }}
                  title={t('Espace du groupe : discussion, répéts, concerts')}
                  onClick={() => navigate(`/band/${band.id}/chat`)}
                >
                  <Icon name="message" size={15} /> {t('Discussion')}
                  {band.cloudId != null &&
                    (notifications.unreadByBand[band.cloudId] ?? 0) > 0 && (
                      <span className="pillcount">
                        {notifications.unreadByBand[band.cloudId]}
                      </span>
                    )}
                </button>
                <span
                  className="chevron"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/band/${band.id}`)}
                >
                  ›
                </span>
              </SwipeRow>
            ))}
          </div>
        )}
        <div className="spacer" />
        {creating ? (
          <div>
            <Field label={t('Nom du groupe')}>
              <input
                type="text"
                value={newName}
                placeholder={t('Mon groupe')}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreate();
                  else if (e.key === 'Escape') cancelCreate();
                }}
              />
            </Field>
            <div className="rowactions">
              <button className="btn" onClick={confirmCreate}>
                {t('Créer le groupe')}
              </button>
              <button className="btn ghost" onClick={cancelCreate}>
                {t('Annuler')}
              </button>
            </div>
          </div>
        ) : null}
        <p className="help" style={{ textAlign: 'center' }}>
          {t('Tu invites les autres ensuite, depuis la fiche du groupe.')}
        </p>
      </div>
      {/* Jamais de suppression sur un seul geste (b254) : la corbeille ouvre
          une confirmation, avec le mot juste — « dissoudre » quand le groupe
          est à moi, « quitter » quand je l'ai rejoint. Même décision et mêmes
          textes que la fiche du groupe (`lib/deleteband.ts`). */}
      {aSupprimer !== null && (
        <ConfirmSheet
          title={texteSuppression(aSupprimer).titre}
          message={texteSuppression(aSupprimer).message}
          confirmLabel={texteSuppression(aSupprimer).libelle}
          danger
          onConfirm={() => {
            const groupe = aSupprimer;
            setASupprimer(null);
            void detacherDuCloud(groupe);
            deleteBand(groupe.id);
          }}
          onClose={() => setASupprimer(null)}
        />
      )}
    </>
  );
}
