/**
 * Pourboires : simple, fluide, agréable.
 * Utilise le lien de paiement de l'artiste (PayPal.me, Lydia, Stripe…).
 * Les liens PayPal.me acceptent le montant directement dans l'URL.
 */
import React from 'react';

import { ArtistProfile } from '../types';

const AMOUNTS = [2, 5, 10];

function tipHref(base: string, amount: number | null): string {
  const clean = base.trim().replace(/\/+$/, '');
  if (amount !== null && /paypal\.me\//i.test(clean)) {
    return `${clean}/${amount}EUR`;
  }
  return clean;
}

export function TipBox({ artist }: { artist: ArtistProfile | null }) {
  // `?? ''` : une fiche publique publiée AVANT l'ajout du champ tipUrl n'a
  // pas ce champ — ça ne doit jamais faire tomber toute la page publique.
  if (!artist || (artist.tipUrl ?? '').trim() === '') return null;
  return (
    <div className="tipbox">
      <div className="tiptitle">💛 Soutenir {artist.name || "l'artiste"}</div>
      <div className="tipamounts">
        {AMOUNTS.map((a) => (
          <a
            key={a}
            className="tipbtn"
            href={tipHref(artist.tipUrl, a)}
            target="_blank"
            rel="noreferrer"
          >
            {a} €
          </a>
        ))}
        <a
          className="tipbtn free"
          href={tipHref(artist.tipUrl, null)}
          target="_blank"
          rel="noreferrer"
        >
          Montant libre
        </a>
      </div>
      <p className="help" style={{ textAlign: 'center', marginTop: 8 }}>
        Paiement sécurisé, directement à l'artiste.
      </p>
    </div>
  );
}
