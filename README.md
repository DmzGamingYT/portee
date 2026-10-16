# SpotifyCraft

Un clone open-source d'interface musicale type Spotify : recherche, albums, artistes,
playlists, likes, historique et lecteur audio. Même esprit que TubeCraft (clone YouTube
du même dossier) appliqué à la musique.

L'application n'utilise **aucune clé API, aucun compte** : elle interroge l'API publique
iTunes (itunes.apple.com) via un proxy local et lit les **extraits officiels de 30 s**
fournis par cette API. Les métadonnées (titres, artistes, pochettes, durées) sont donc des
**vraies données musicales**.

## Démarrage

```bash
npm install
npm run dev        # http://127.0.0.1:5184
```

Sur macOS, vous pouvez aussi **double-cliquer sur `Démarrer SpotifyCraft.command`**.

Autres commandes :

```bash
npm run typecheck  # vérification TypeScript
npm run build      # build de production dans dist/
npm run preview    # sert dist/ (le proxy reste actif)
```

## Fonctionnalités

| Domaine | Détail |
| --- | --- |
| Accueil | Salutation dynamique, raccourcis playlists, chips de genres, étagères Pop / Rock / Hip-Hop / Électro / Jazz / Chanson française, sélection « du jour » |
| Recherche | Recherche **en direct** (proxy local, sans clé) : titres, albums, artistes — débouncée, annulable, repli propre si l'API est injoignable |
| Lecture | Lecteur audio réel en bas de page : lecture/pause, titres suivants/précédents, shuffle, répéter (offset/all/un), barre de progression cliquable, volume, mute |
| Albums | Page album : pochette, artiste, liste des pistes, lecture de l'album complet |
| Artistes | Page artiste : titres populaires, albums, bouton « s'abonner » |
| Playlists | Création / renommage / suppression, ajout via le menu ⊕ des lignes, lecture en une puce |
| Likés | Sélection automatique « Titres likés » (♡) lisible comme une playlist |
| Bibliothèque | Raccourcis, liste des playlists, tout persisté dans le navigateur (localStorage) |
| Thème | Sombre (par défaut) et clair, responsive mobile/desktop |

## Connexion (facultatif)

Aucun compte n'est requis : la bibliothèque est locale au navigateur. Une fenêtre de connexion
(facultative, comme TubeCraft) pourra être branchée plus tard via `VITE_SPOTIFY_CLIENT_ID`
(voir `.env.example`) — l'app fonctionne entièrement sans.

## Architecture

```
vite.config.ts              config Vite + plugin proxy
server/itunesProxy.ts       proxy iTunes (dev + preview) : /it/api/search, /it/api/lookup
src/api/itunes.ts           client : recherche titres/albums/artistes, lookups album/artistes
src/store.ts                état global persistant (lecteur + likes + playlists + historique)
src/components/             barre de lecture, moteur audio, sidebar, topbar, lignes de titres, cartes
src/pages/                  Accueil, Recherche, Bibliothèque, Playlist, Album, Artiste
```

### Pourquoi un proxy ?

L'API itunes.apple.com ne renvoie pas d'en-têtes CORS fiables depuis un navigateur. Le plugin
Vite expose donc des routes locales `/it/api/*` qui interrogent la musique côté serveur
(aucune clé, aucun secret). Pour un hébergement statique, exposez les mêmes routes via un
petit service (Cloudflare Worker, Netlify/Vercel function) — le front ne change pas.

## Limites connues

- La lecture est volontairement limitée aux **extraits officiels ~30 s** fournis gratuitement
  par l'API : pas de rippers, pas de filtres décryptés. Pour des titres complets, il faudrait
  un catalogue local que chacun fournit (le lecteur accepte déjà n'importe quelle URL `preview`).
- iTunes est une API d'Apple ; les champs peuvent évoluer — ajuster `src/api/itunes.ts`.
- Projet indépendant, non affilié à Spotify / Apple. Les noms et marques appartiennent à leurs
  propriétaires.

## Licence

SpotifyCraft est publié sous licence [MIT](LICENSE) — libre à chacun d'utiliser, modifier et
redistribuer.
