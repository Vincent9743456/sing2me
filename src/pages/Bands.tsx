/**
 * Onglet Groupes : tous tes groupes au premier niveau — leur fiche,
 * leur espace de discussion, et la création en un geste.
 */
import React from 'react';

import { Icon } from '../components/Icon';
import { Empty, TopBar } from '../components/ui';
import { creatorMember } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptyBand } from '../types';

export function Bands() {
  const { bands, artist, prefs, saveBand } = useStore();

  function createBand() {
    const b = {
      ...emptyBand(),
      name: 'Mon groupe',
      members: [creatorMember(artist, prefs.userName)],
    };
    saveBand(b);
    navigate(`/band/${b.id}`);
  }

  return (
    <>
      <TopBar title="Groupes" />
      <div className="page">
        {bands.length === 0 ? (
          <Empty>
            Joue à plusieurs : crée ton groupe (tu en seras le premier
            musicien), invite les autres par lien ou QR — chacun avec son
            compte. Vous partagerez le répertoire, les setlists, et un
            espace de discussion pour préparer répéts et concerts.
          </Empty>
        ) : (
          <div className="list">
            {bands.map((band) => (
              <div className="row" key={band.id}>
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
                    <div className="title">{band.name || '(sans nom)'}</div>
                    <div className="sub">
                      {band.members.length} musicien
                      {band.members.length > 1 ? 's' : ''}
                      {band.members.length > 0
                        ? ` · ${band.members
                            .map((m) => m.name)
                            .filter((n) => n !== '')
                            .join(', ')}`
                        : ''}
                    </div>
                  </div>
                </div>
                <button
                  className="btn ghost small"
                  title="Espace du groupe : discussion, répéts, concerts"
                  onClick={() => navigate(`/band/${band.id}/chat`)}
                >
                  <Icon name="message" size={15} /> Discussion
                </button>
                <span
                  className="chevron"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/band/${band.id}`)}
                >
                  ›
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="spacer" />
        <button className="btn block" onClick={createBand}>
          ＋ Créer un groupe
        </button>
        <p className="help" style={{ textAlign: 'center' }}>
          Le créateur en est automatiquement le premier musicien (avec son
          matériel). Les invitations s'envoient depuis la fiche du groupe.
        </p>
      </div>
    </>
  );
}
