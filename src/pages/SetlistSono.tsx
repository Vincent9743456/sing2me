/**
 * Sono & scène d'une setlist — ÉCRAN DÉDIÉ (#/setlist/:id/sono), sorti du
 * détail de la setlist (une mission par écran) : plan de scène, matériel,
 * branchements, réglages. Validation visible (b149) : barre « Valider / Annuler ».
 */
import React, { useEffect, useRef, useState } from 'react';

import { gearIcon } from '../components/GearEditor';
import { Icon } from '../components/Icon';
import { StagePlan } from '../components/StagePlan';
import { Field, Modal, SaveBar, TopBar } from '../components/ui';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptySetup, Setlist, StageSetup } from '../types';

export function SetlistSono({ id }: { id: string }) {
  const { setlists, saveSetlist, bands, artist, prefs } = useStore();
  const existing = setlists.find((s) => s.id === id);
  const [draft, setDraft] = useState<Setlist | null>(() =>
    existing ? { ...existing } : null,
  );
  const [gearPicker, setGearPicker] = useState(false);
  const [saved, setSaved] = useState(false);

  /**
   * Validation explicite (b149) : plus d'enregistrement à la volée — la
   * barre « Valider / Annuler » apparaît dès la première modification.
   */
  const dirty =
    draft !== null &&
    existing !== undefined &&
    JSON.stringify(draft.setup ?? null) !==
      JSON.stringify(existing.setup ?? null);

  function confirmSetup() {
    if (!draft) return;
    saveSetlist(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  function cancelSetup() {
    if (existing) setDraft({ ...existing });
  }

  if (!draft) {
    return (
      <>
        <TopBar
          live={false}
          title="Sono & scène"
          onBack={() => navigate('/setlists')}
        />
        <div className="page">
          <p className="help">Cette setlist n'existe plus.</p>
        </div>
      </>
    );
  }

  const setup = draft.setup ?? emptySetup();
  function updateSetup(patch: Partial<StageSetup>) {
    setDraft((d) =>
      d ? { ...d, setup: { ...(d.setup ?? emptySetup()), ...patch } } : d,
    );
  }

  /** Inventaires disponibles : le mien + ceux des musiciens du groupe. */
  const gearSources = [
    {
      owner: prefs.userName || artist.name || 'Moi',
      items: artist.gear ?? [],
    },
    ...(bands.find((b) => b.id === (draft.bandId ?? ''))?.members ?? []).map(
      (m) => ({ owner: m.name || 'Musicien', items: m.gear ?? [] }),
    ),
  ].filter((s) => s.items.length > 0);

  /** Ajoute / retire un matériel du plan de scène. */
  function toggleGear(
    gearId: string,
    name: string,
    owner: string,
    category: string,
  ) {
    const placed = setup.positions.some((p) => p.id === gearId);
    if (placed) {
      updateSetup({
        positions: setup.positions.filter((p) => p.id !== gearId),
      });
    } else {
      updateSetup({
        positions: [
          ...setup.positions,
          {
            id: gearId,
            label: name,
            instrument: owner,
            x: Math.min(0.9, 0.12 + ((setup.positions.length * 0.16) % 0.76)),
            y: 0.78,
            kind: 'gear' as const,
            category: category as StageSetup['positions'][number]['category'],
          },
        ],
      });
    }
  }

  /** Place d'un coup les musiciens du groupe sur le plan de scène. */
  function seedPositions() {
    const band = bands.find((b) => b.id === (draft?.bandId ?? ''));
    const members = band?.members ?? [];
    if (members.length === 0) return;
    const present = new Set(setup.positions.map((p) => p.id));
    const added = members
      .filter((m) => !present.has(m.id))
      .map((m, i) => ({
        id: m.id,
        label: m.name || 'Musicien',
        instrument: m.instrument,
        x: 0.5 + (i - (members.length - 1) / 2) * 0.22,
        y: 0.45,
      }))
      .map((p) => ({ ...p, x: Math.min(0.92, Math.max(0.08, p.x)) }));
    if (added.length > 0) {
      updateSetup({ positions: [...setup.positions, ...added] });
    }
  }

  return (
    <>
      <TopBar
        live={false}
        title={`Sono & scène — ${draft.name || 'Sans titre'}`}
        onBack={() => navigate(`/setlist/${draft.id}`)}
      />
      <div className="page">
        <div className="field">
          <label>Plan de scène</label>
          <p className="help" style={{ margin: '0 0 6px' }}>
            Déplace chacun au doigt ou à la souris.
          </p>
          <StagePlan
            positions={setup.positions}
            onChange={(positions) => updateSetup({ positions })}
          />
          <div
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}
          >
            {(draft.bandId ?? '') !== '' && (
              <button className="btn ghost small" onClick={seedPositions}>
                <Icon name="users" size={14} /> Placer les musiciens du groupe
              </button>
            )}
            <button
              className="btn ghost small"
              onClick={() => setGearPicker(true)}
            >
              <Icon name="speaker" size={14} /> Piocher le matériel des
              musiciens
            </button>
          </div>
        </div>
        <Field label="Matériel">
          <textarea
            value={setup.gear}
            placeholder={'Sono 2×12", console 8 pistes, 3 micros SM58, DI basse…'}
            onChange={(e) => updateSetup({ gear: e.target.value })}
          />
        </Field>
        <Field label="Branchements">
          <textarea
            value={setup.wiring}
            placeholder={'Voie 1 : chant lead\nVoie 2 : guitare (DI)\nVoie 3-4 : claviers…'}
            onChange={(e) => updateSetup({ wiring: e.target.value })}
          />
        </Field>
        <Field label="Effets et réglages sono">
          <textarea
            value={setup.sound}
            placeholder={'Reverb légère sur le chant, delay refrain de « Angie », retours…'}
            onChange={(e) => updateSetup({ sound: e.target.value })}
          />
        </Field>
        {saved && !dirty && <div className="savedhint">✓ Enregistré</div>}
      </div>

      <SaveBar visible={dirty} onSave={confirmSetup} onCancel={cancelSetup} />

      {gearPicker && (
        <Modal
          title="Matériel des musiciens"
          onClose={() => setGearPicker(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            Pioché dans « Mon matériel » (fiche Artiste) et dans le matériel
            des musiciens du groupe. Un clic le place sur le plan de scène ;
            un second l'en retire — de quoi vérifier que rien ne manque.
          </p>
          {gearSources.length === 0 && (
            <p className="help">
              Aucun matériel déclaré pour l'instant : remplis « Mon
              matériel » dans l'onglet Artiste, et celui des musiciens dans
              la fiche du groupe (section Musiciens → Matériel).
            </p>
          )}
          {gearSources.map((src) => (
            <div key={src.owner} style={{ marginBottom: 10 }}>
              <div className="help" style={{ fontWeight: 700, marginBottom: 4 }}>
                {src.owner}
              </div>
              {src.items.map((g) => {
                const placed = setup.positions.some((p) => p.id === g.id);
                return (
                  <div
                    className="row"
                    key={g.id}
                    onClick={() =>
                      toggleGear(
                        g.id,
                        (g.qty ?? 1) > 1 ? `${g.name} ×${g.qty}` : g.name,
                        src.owner,
                        g.category,
                      )
                    }
                  >
                    <Icon name={gearIcon(g.category)} size={15} />
                    <div className="grow">
                      <div className="title">
                        {g.name}
                        {(g.qty ?? 1) > 1 && (
                          <span className="stauthor"> ×{g.qty}</span>
                        )}
                      </div>
                    </div>
                    {placed ? (
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        ✓ Sur le plan
                      </span>
                    ) : (
                      <span className="chevron">
                        <Icon name="plus" size={16} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <button
            className="btn ghost block"
            onClick={() => setGearPicker(false)}
          >
            Fermer
          </button>
        </Modal>
      )}
    </>
  );
}
