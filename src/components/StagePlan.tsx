/**
 * Plan de scène : les musiciens se placent au doigt ou à la souris.
 * Coordonnées relatives (0…1) — le plan s'adapte à toutes les tailles.
 * readOnly = affichage seul (partage au groupe).
 */
import React, { useRef, useState } from 'react';

import { gearIcon } from './GearEditor';
import { Icon } from './Icon';
import { makeId, StagePos } from '../types';

export function StagePlan({
  positions,
  onChange,
  readOnly = false,
}: {
  positions: StagePos[];
  onChange?: (positions: StagePos[]) => void;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [newName, setNewName] = useState('');
  const [newInstr, setNewInstr] = useState('');

  function moveTo(id: string, clientX: number, clientY: number) {
    if (readOnly || !onChange) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(0.97, Math.max(0.03, (clientX - rect.left) / rect.width));
    const y = Math.min(0.94, Math.max(0.06, (clientY - rect.top) / rect.height));
    onChange(positions.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }

  return (
    <div>
      <div className="stageplan" ref={ref}>
        <span className="edge back">FOND DE SCÈNE</span>
        <span className="edge front">PUBLIC</span>
        {positions.map((p) => (
          <div
            key={p.id}
            className={`pos ${p.kind === 'gear' ? 'gear' : ''} ${readOnly ? 'ro' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            onPointerDown={(e) => {
              if (readOnly) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 0) return;
              e.preventDefault();
              moveTo(p.id, e.clientX, e.clientY);
            }}
          >
            <span className="pname">
              {p.kind === 'gear' && (
                <Icon name={gearIcon(p.category)} size={11} />
              )}{' '}
              {p.label || '?'}
            </span>
            {p.instrument !== '' && (
              <span className="pinstr">{p.instrument}</span>
            )}
            {!readOnly && onChange && (
              <button
                className="premove"
                title={`Retirer ${p.label}`}
                aria-label={`Retirer ${p.label} du plan`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  onChange(positions.filter((x) => x.id !== p.id))
                }
              >
                <Icon name="x" size={10} />
              </button>
            )}
          </div>
        ))}
        {positions.length === 0 && (
          <span className="help planempty">
            {readOnly
              ? 'Plan de scène vide.'
              : 'Ajoute les musiciens ci-dessous, puis déplace-les au doigt ou à la souris.'}
          </span>
        )}
      </div>
      {!readOnly && onChange && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newName}
            placeholder="Nom"
            style={{ flex: '1 1 110px' }}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="text"
            value={newInstr}
            placeholder="Instrument"
            style={{ flex: '1 1 110px' }}
            onChange={(e) => setNewInstr(e.target.value)}
          />
          <button
            className="btn ghost small"
            disabled={newName.trim() === ''}
            onClick={() => {
              onChange([
                ...positions,
                {
                  id: makeId(),
                  label: newName.trim(),
                  instrument: newInstr.trim(),
                  x: 0.15 + ((positions.length * 0.18) % 0.7),
                  y: 0.45,
                },
              ]);
              setNewName('');
              setNewInstr('');
            }}
          >
            <Icon name="plus" size={14} /> Placer
          </button>
        </div>
      )}
    </div>
  );
}
