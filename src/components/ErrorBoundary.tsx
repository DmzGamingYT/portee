import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Garde-fou global : une erreur de rendu affiche un écran lisible et un bouton
 * de rechargement au lieu d'une page blanche (les erreurs de données de l'API
 * ne doivent jamais tuer toute l'application).
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error | null } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Visible en console pour le débogage local ; pas de service externe.
    console.error('SpotifyCraft — erreur de rendu', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <h1>Quelque chose s’est mal passé</h1>
        <p className="muted">
          L’interface a rencontré une erreur inattendue. Vos playlists et vos likes sont conservés
          dans le navigateur.
        </p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <div className="error-actions">
          <button className="btn accent" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/');
            }}
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }
}
