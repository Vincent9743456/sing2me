/**
 * RÉGLAGE « PÉDALE MIDI » (b296, demande de Vincent) — dans les Réglages.
 *
 * On active la pédale, on choisit l'entrée MIDI branchée, et on APPREND chaque
 * action en appuyant une fois sur la pédale voulue : la signature de l'appui
 * est mémorisée, jamais devinée. Les trois actions sont celles du mode scène.
 *
 * Rien ne s'affiche si le navigateur ne connaît pas le MIDI (Safari iOS, par
 * exemple) : un réglage qui ne mène à rien vaut mieux caché qu'affiché mort.
 */
import React, { useEffect, useState } from 'react';

import { Icon } from './Icon';
import { t } from '../i18n';
import {
  entreesMidi,
  lireMidiConfig,
  ecrireMidiConfig,
  midiDisponible,
  sabonnerAppuiMidi,
  sabonnerEntreesMidi,
  assurerAccesMidi,
  MidiAction,
  MidiConfig,
} from '../lib/midi';

const ACTIONS: { cle: MidiAction; label: string }[] = [
  { cle: 'suivant', label: 'Morceau suivant' },
  { cle: 'precedent', label: 'Morceau précédent' },
  { cle: 'defilement', label: 'Défilement (marche / arrêt)' },
  { cle: 'accelerer', label: 'Accélérer le défilement' },
  { cle: 'ralentir', label: 'Ralentir le défilement' },
];

export function PedaleMidi() {
  const [cfg, setCfg] = useState<MidiConfig>(() => lireMidiConfig());
  const [entrees, setEntrees] = useState<{ id: string; nom: string }[]>([]);
  const [apprend, setApprend] = useState<MidiAction | null>(null);
  const dispo = midiDisponible();

  // Rafraîchir la liste des entrées (branchement / débranchement).
  useEffect(() => {
    if (!dispo) return;
    const maj = () => setEntrees(entreesMidi());
    const off = sabonnerEntreesMidi(maj);
    if (cfg.actif) void assurerAccesMidi().then(maj);
    maj();
    return off;
    // au montage : l'abonnement se recale seul ensuite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispo]);

  // Apprentissage : le PROCHAIN appui affecte l'action, et lie l'entrée.
  useEffect(() => {
    if (apprend === null) return;
    const off = sabonnerAppuiMidi((sig, id) => {
      // `lireMidiConfig` fait foi (cache du module) : pas d'effet de bord dans
      // un updater d'état, et jamais de config périmée capturée par la closure.
      const base = lireMidiConfig();
      const suivant: MidiConfig = {
        ...base,
        actif: true,
        entree: base.entree === '' ? id : base.entree,
        map: { ...base.map, [apprend]: sig },
      };
      ecrireMidiConfig(suivant);
      setCfg(suivant);
      setApprend(null);
    });
    void assurerAccesMidi().then(() => setEntrees(entreesMidi()));
    return off;
  }, [apprend]);

  if (!dispo) return null;

  function appliquer(next: MidiConfig) {
    setCfg(next);
    ecrireMidiConfig(next);
  }

  const libelleSig = (sig: string | undefined): string => {
    if (!sig) return t('non réglée');
    const [type, n] = sig.split(':');
    if (type === 'note') return t('Note {n}', { n });
    if (type === 'cc') return t('Contrôleur {n}', { n });
    if (type === 'pc') return t('Programme {n}', { n });
    return sig;
  };

  return (
    <>
      <div className="spacer" />
      <h2 className="pagetitle">{t('Pédale MIDI')}</h2>
      <p className="help" style={{ marginTop: 0 }}>
        {t(
          'Pilote le mode scène avec une pédale MIDI (USB ou Bluetooth). Une pédale « tourne-pages » qui se comporte en clavier fonctionne déjà sans réglage.',
        )}
      </p>

      <label className="row" style={{ cursor: 'pointer', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={cfg.actif}
          style={{ width: 20, height: 20, flexShrink: 0 }}
          onChange={(e) => {
            const actif = e.target.checked;
            if (actif) void assurerAccesMidi().then(() => setEntrees(entreesMidi()));
            appliquer({ ...cfg, actif });
          }}
        />
        <span className="grow">{t('Activer la pédale MIDI')}</span>
      </label>

      {cfg.actif && (
        <>
          <div className="field" style={{ marginTop: 'var(--sp-2)' }}>
            <label>{t('Entrée MIDI')}</label>
            {entrees.length === 0 ? (
              <p className="help" style={{ margin: '4px 0 0' }}>
                {t(
                  'Aucune pédale détectée — branche-la (ou appaire-la en Bluetooth), puis appuie sur « Apprendre ».',
                )}
              </p>
            ) : (
              <select
                value={cfg.entree}
                onChange={(e) => appliquer({ ...cfg, entree: e.target.value })}
              >
                <option value="">{t('N’importe quelle entrée')}</option>
                {entrees.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.nom}
                  </option>
                ))}
              </select>
            )}
          </div>

          {ACTIONS.map((a) => (
            <div
              key={a.cle}
              className="hstack"
              style={{
                justifyContent: 'space-between',
                gap: 8,
                margin: '8px 0',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div>{t(a.label)}</div>
                <div className="help" style={{ margin: 0 }}>
                  {apprend === a.cle
                    ? t('Appuie sur la pédale…')
                    : libelleSig(cfg.map[a.cle])}
                </div>
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <button
                  className="btn ghost small"
                  onClick={() => setApprend(apprend === a.cle ? null : a.cle)}
                >
                  {apprend === a.cle ? t('Annuler') : t('Apprendre')}
                </button>
                {cfg.map[a.cle] && (
                  <button
                    className="btn ghost small"
                    aria-label={t('Effacer')}
                    onClick={() => {
                      const map = { ...cfg.map };
                      delete map[a.cle];
                      appliquer({ ...cfg, map });
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
