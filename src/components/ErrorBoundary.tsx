/**
 * Filet de sécurité global : convertit toute erreur de rendu en un écran
 * lisible et récupérable (au lieu d'une page noire), et affiche le message
 * d'erreur pour diagnostic. Un bouton « Recharger » repart sur une route
 * propre (utile si un hash technique — retour de lien magique — a coincé).
 */
import React from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Trace en console pour le diagnostic (visible dans les outils dev).
    // eslint-disable-next-line no-console
    console.error('Sing2Me — erreur de rendu :', error, info?.componentStack);
  }

  private reset = () => {
    try {
      // On repart sur l'accueil : évite de rester coincé sur un hash technique
      // (ex. #access_token=… d'un retour de lien magique).
      location.hash = '#/';
    } catch {
      /* location indisponible */
    }
    location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            color: '#f2f2f2',
            background: '#0e0e10',
          }}
        >
          <div style={{ fontSize: '2rem' }}>🎸</div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
            Oups — un petit couac
          </h1>
          <p style={{ margin: 0, maxWidth: 420, opacity: 0.8, lineHeight: 1.5 }}>
            L'application a rencontré une erreur inattendue. Tes données sont
            en sécurité (elles restent sur ton appareil). Recharge pour
            reprendre.
          </p>
          <button
            onClick={this.reset}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '12px 22px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: '#f6832a',
              color: '#16120a',
            }}
          >
            Recharger l'application
          </button>
          <details style={{ maxWidth: 420, opacity: 0.6, fontSize: '0.8rem' }}>
            <summary style={{ cursor: 'pointer' }}>Détail technique</summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                textAlign: 'left',
                marginTop: 8,
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
