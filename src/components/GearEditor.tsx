/**
 * Inventaire de matériel : liste + ajout (nom, catégorie).
 * Utilisé sur la fiche Artiste (« Mon matériel ») et sur les membres
 * d'un groupe — puis pioché dans le plan de scène des setlists.
 */
import React, { useState } from 'react';

import { Icon, IconName } from './Icon';
import { t } from '../i18n';
import { GearCategory, GearItem, makeId } from '../types';

export const GEAR_CATEGORIES: {
  value: GearCategory;
  label: string;
  icon: IconName;
}[] = [
  { value: 'instrument', label: 'Instrument', icon: 'music' },
  { value: 'micro', label: 'Micro', icon: 'mic' },
  { value: 'ampli', label: 'Ampli', icon: 'speaker' },
  { value: 'sono', label: 'Sono', icon: 'sliders' },
  { value: 'effet', label: 'Effet', icon: 'zap' },
  { value: 'cable', label: 'Câble', icon: 'plug' },
  { value: 'autre', label: 'Autre', icon: 'clipboard' },
];

export function gearIcon(category: GearCategory | undefined): IconName {
  return (
    GEAR_CATEGORIES.find((c) => c.value === category)?.icon ?? 'clipboard'
  );
}

export function GearEditor({
  items,
  onChange,
}: {
  items: GearItem[];
  onChange: (items: GearItem[]) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GearCategory>('instrument');
  const [qty, setQty] = useState(1);

  function add() {
    if (name.trim() === '') return;
    onChange([
      ...items,
      {
        id: makeId(),
        name: name.trim(),
        category,
        qty: qty > 1 ? qty : undefined,
      },
    ]);
    setName('');
    setQty(1);
  }

  return (
    <div>
      {items.map((g) => (
        <div
          key={g.id}
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}
        >
          <Icon name={gearIcon(g.category)} size={15} />
          <span style={{ flex: 1 }}>
            {g.name}
            <span className="stauthor">
              {' '}
              ·{' '}
              {t(
                GEAR_CATEGORIES.find((c) => c.value === g.category)?.label ??
                  '',
              )}
            </span>
          </span>
          <input
            type="number"
            min={1}
            value={g.qty ?? 1}
            title={t('Quantité')}
            aria-label={t('Quantité de {name}', { name: g.name })}
            style={{ width: 58, padding: '4px 6px', textAlign: 'center' }}
            onChange={(e) => {
              const n = Math.max(1, parseInt(e.target.value, 10) || 1);
              onChange(
                items.map((x) =>
                  x.id === g.id
                    ? { ...x, qty: n > 1 ? n : undefined }
                    : x,
                ),
              );
            }}
          />
          <button
            className="btn ghost small"
            title={t('Retirer')}
            aria-label={t('Retirer {name}', { name: g.name })}
            onClick={() => onChange(items.filter((x) => x.id !== g.id))}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={name}
          placeholder={t('Câble XLR, guitare Takamine, HF Sennheiser…')}
          style={{ flex: '2 1 150px' }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <input
          type="number"
          min={1}
          value={qty}
          title={t('Quantité')}
          aria-label={t('Quantité')}
          style={{ width: 58, padding: '4px 6px', textAlign: 'center' }}
          onChange={(e) =>
            setQty(Math.max(1, parseInt(e.target.value, 10) || 1))
          }
        />
        <select
          value={category}
          style={{ width: 'auto' }}
          onChange={(e) => setCategory(e.target.value as GearCategory)}
        >
          {GEAR_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {t(c.label)}
            </option>
          ))}
        </select>
        <button
          className="btn ghost small"
          disabled={name.trim() === ''}
          onClick={add}
        >
          <Icon name="plus" size={14} /> {t('Ajouter')}
        </button>
      </div>
    </div>
  );
}
