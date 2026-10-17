# SpotifyCraft

Clone open-source d'interface musicale type Spotify : recherche, albums, artistes,
playlists, likes, historique, file d'attente et lecteur audio — dans le même esprit
que TubeCraft, appliqué à la musique.

L'application **ne dépend d'aucune clé API** : elle interroge l'API publique iTunes
via un proxy local et lit les **extraits officiels de 30 s** fournis par cette API.
Les métadonnées (titres, artistes, albums, pochettes, durées) sont de vraies données
musicales. La **seule authentification** passe par Spotify (OAuth PKCE, sans
secret) : l'application n'a ni compte local ni mot de passe, et redirige vers la
page officielle de Spotify où l'utilisateur choisit la méthode proposée par
Spotify (e-mail, Google, Apple, Facebook, code par SMS…). Une fois connecté, les
métadonnées viennent de Spotify et les extraits manquants d'iTunes.

Une **bibliothèque audio locale** complète le catalogue de découverte : glissez
des fichiers MP3, M4A, FLAC, WAV, OGG ou OPUS n'importe où dans l'application pour
les importer dans IndexedDB et les écouter **en entier**, sans serveur ni envoi de
fichier.

Des **Daily Mix personnalisés** sont calculés à partir des likes, de l'historique,
des playlists et des genres — sans backend, sans profil envoyé nulle part : le plan
du jour est stable et déterministe, et le catalogue n'est interrogé que pour
résoudre les sélections.

## Démarrage

Prérequis : **Node.js ≥ 20.19** (ou ≥ 22.12 pour Vite 8).

```bash
npm install
npm run dev        # http://127.0.0.1:5184
```

Sur macOS, vous pouvez aussi **double-cliquer sur `Démarrer SpotifyCraft.command`**.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement + proxies iTunes/Spotify |
| `npm run typecheck` | vérification TypeScript stricte |
| `npm test` | tests unitaires (Vitest) |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert `dist/` sur `:5185` (proxies actifs) |

## Fonctionnalités

| Domaine | Détail |
| --- | --- |
| Accueil | Salutation dynamique, raccourcis playlists, « Écoutés récemment », chips de genres (dont **Tous**), étagères Pop / Rock / Hip-Hop / Électro / Jazz / Chanson française, artiste du jour |
| Recherche | Recherche **en direct** débouncée et annulable, titres + albums + artistes, badge de source (Spotify / iTunes, provenance des extraits), états vide/erreur/recherche partielle distincts, URL propre (pas d'entrée d'historique par frappe) |
| Lecture | Lecteur réel en bas de page : lecture/pause, précédent/suivant, aléatoire, répétition (hors/tout/un), progression cliquable **et navigable au clavier**, volume, mute, **fondu** de début/fin d'extrait |
| File d'attente | Panneau dédié (desktop et mobile), piste en cours, titres à venir, **glisser-déposer** pour réordonner, retrait d'un titre, « Lire ensuite » / « Ajouter à la file » depuis le menu d'une ligne |
| Système | **MediaSession** (touches média, casque, écran verrouillé), raccourcis clavier (`Espace`, `←/→`, `Maj+←/→`, `M`, `S`, `R`) |
| Compte | **Connexion Spotify uniquement** (OAuth PKCE, aucun compte ni mot de passe local) : un clic ouvre la page de connexion Spotify, retour sur `/callback`, menu de compte (avatar, nom, e-mail, offre Premium/Free) et déconnexion ; tokens en `localStorage`, scopes lecture seule |
| Albums | Page album : pochette, artiste cliquable, liste des pistes, lecture complète, durée totale, titre lisible |
| Artistes | Titres populaires, albums, photo (Spotify), bouton « S'abonner » ; les artistes suivis apparaissent dans la bibliothèque |
| Playlists | Création / renommage / suppression, ajout via le menu ⊕, lecture en une puce, retrait d'un titre |
| Likés | Sélection automatique « Titres likés » lisible comme une playlist |
| Historique | Alimenté uniquement quand un titre est **réellement audible**, page dédiée, lecture complète et effacement |
| Bibliothèque | Titres likés, historique récent, artistes suivis, playlists — persistés en `localStorage` |
| **Ma musique locale** | **Glisser-déposer** ou sélection de fichiers audio, stockage IndexedDB (métadonnées + blobs séparés), lecture complète dans le lecteur existant, filtrage, suppression unitaire ou totale ; compatible likes, playlists, historique et file d'attente |
| **Daily Mix** | Sélections personnelles calculées **localement** : profil de goût (likes, écoutes, playlists, artistes suivis), familles de genres, mix « artiste » et « favoris » ; plan stable pour la journée, cache local, recalcul manuel, lecture complète depuis l'accueil ou la page dédiée |
| Option | **Aperçu audio au survol** des lignes (désactivé par défaut, activable dans le lecteur) |
| Thème | Sombre (par défaut) et clair, responsive mobile/desktop, animations respectant `prefers-reduced-motion` |

## Connexion Spotify (unique méthode de connexion)

L'application ne crée **aucun compte local** et ne stocke **aucun mot de passe** :
la connexion se fait exclusivement avec Spotify. Le bouton « Se connecter avec
Spotify » ouvre la page officielle de Spotify, où l'utilisateur choisit la
méthode que Spotify propose (e-mail + mot de passe, Google, Apple, Facebook,
code par SMS…). Spotify redirecte ensuite l'utilisateur sur `/callback`, où
l'application échange le code contre ses jetons.

Côté **exploitant de l'application** (une seule fois) :

1. Créez une application sur <https://developer.spotify.com/dashboard>.
2. Déclarez l'URL de redirection exacte `http://127.0.0.1:5184/callback`
   (et `http://127.0.0.1:5185/callback` pour `npm run preview` ; adaptez le port
   si vous lancez le serveur ailleurs — le port doit correspondre **au caractère
   près**, sinon Spotify refuse la connexion).
3. Renseignez `VITE_SPOTIFY_CLIENT_ID` dans `.env`, puis relancez `npm run dev`.

Sans `VITE_SPOTIFY_CLIENT_ID`, l'application reste pleinement utilisable avec le
catalogue public iTunes, et le bouton Spotify explique la configuration
manquante au lieu d'échouer silencieusement.

Le flux est **Authorization Code + PKCE** : aucun `client_secret` n'est stocké
côté navigateur, le `state` OAuth est vérifié au retour (protection CSRF), les
scopes sont en lecture seule (`user-read-private`, `user-read-email`,
`user-library-read`, `user-follow-read`, `playlist-read-private`,
`playlist-read-collaborative`) et la déconnexion purge les jetons locaux.

> **Important — extraits Spotify.** Depuis fin 2024, Spotify ne garantit plus
> `preview_url` aux nouvelles applications. SpotifyCraft utilise donc Spotify
> pour les métadonnées (pochettes, ids, liens) et **complète les extraits manquants
> avec iTunes** (rapprochement titre + artiste). Si aucun extrait n'est trouvé,
> les titres iTunes prennent le relais pour que la lecture reste possible.

## Architecture

```
vite.config.ts                 Vite 8 + plugin React + proxies
server/itunesProxy.ts          /it/api/search, /it/api/lookup (cache borné)
server/spotifyProxy.ts         /sp/api/* (Bearer utilisateur, cache borné, no-store)
src/api/itunes.ts              client iTunes (proxy puis direct)
src/api/spotify.ts             client Web API Spotify
src/api/spotifyAuth.ts         PKCE, refresh token dédupliqué, state OAuth
src/api/search.ts              recherche unifiée + hybridation des extraits + cache
src/lib/queue.ts               logique pure de file (prochain titre, seek de départ…)
src/lib/previewMatch.ts        rapprochement titre/artiste Spotify ↔ iTunes
src/lib/tracks.ts              diversification des étagères
src/lib/dailyMix.ts            profil de goût, familles de genres, plan et classement des Daily Mix
src/lib/useDailyMixes.ts       chargement des mix + cache local du jour
src/lib/id3.ts                 lecture des tags ID3v2/ID3v1 + nom de fichier
src/lib/localLibrary.ts        IndexedDB (métadonnées + blobs), import, suppression
src/lib/useLocalTracks.ts      liste locale réactive (import/suppression)
src/lib/useKeyboardShortcuts.ts raccourcis globaux
src/store.ts                   état persistant (lecteur, likes, playlists, historique)
src/components/player/         AudioEngine, PlayerBar, QueuePanel
src/components/GlobalDropTarget.tsx dépôt de fichiers global + retour visuel
src/pages/                     Accueil, Recherche, Bibliothèque, Ma musique locale,
                               Daily Mix, Playlist, Album, Artiste, Historique, Callback
```

### Pourquoi un proxy ?

L'API iTunes ne renvoie pas d'en-têtes CORS fiables depuis un navigateur, et le
proxy Spotify évite d'exposer les appels et permet un cache court côté serveur.
Pour un hébergement statique, exposez les mêmes routes via un petit service
(Cloudflare Worker, Netlify/Vercel function) — le front ne change pas.

### Qualité

- TypeScript strict, aucun `any` dans les types publics.
- Tests unitaires sur la file de lecture, le rapprochement des extraits, les
  formats, les tags ID3, la diversification et la logique des Daily Mix
  (profil, plan, classement déterministe) : `npm test`.
- Caches mémoire des proxys bornés (pas de fuite), tokens jamais utilisés comme
  clés de cache, réponses personnelles en `Cache-Control: no-store`.
- `ErrorBoundary` global : une erreur de rendu n'affiche plus une page blanche.
- Accessibilité : focus visible, sliders clavier, libellés ARIA, `aria-live`
  pour les erreurs, respect de `prefers-reduced-motion`.

## Limites connues

- Le catalogue en ligne reste limité aux **extraits officiels ~30 s** : pas de
  rippers ni de filtres décryptés. Les **fichiers importés localement** sont lus en
  entier.
- Bibliothèque locale : les métadonnées sont lues pour les **MP3** (ID3v2/ID3v1) ;
  pour les autres formats, le nom de fichier fait foi et la durée est lue par le
  navigateur. Les pochettes intégrées ne sont pas extraites (une pochette dérivée
  du titre est générée). La lecture dépend des codecs supportés par le navigateur
  (FLAC/OPUS peuvent manquer sur certains systèmes).
- IndexedDB est propre au navigateur et au profil : les fichiers ne sont pas
  synchronisés entre appareils et peuvent être évincés si le quota de stockage est
  atteint (la persistance est demandée, sans garantie).
- Le « fondu » est une enveloppe de volume en début/fin d'extrait, **sans
  chevauchement** entre deux titres (une seule balise audio).
- Les tokens Spotify sont conservés en `localStorage` (standard pour une SPA
  PKCE) : une faille XSS les exposerait. Les scopes sont en lecture seule.
- iTunes est une API d'Apple ; les champs peuvent évoluer — ajuster
  `src/api/itunes.ts`.
- Projet indépendant, non affilié à Spotify / Apple. Les noms et marques
  appartiennent à leurs propriétaires.

## Pistes pour aller plus loin

- **Pochettes locales** : extraire la jaquette embarquée (ID3 APIC, FLAC PICTURE)
  pour remplacer la pochette générée.
- **Recommandations affinées** : passer du simple genre à la co-écoute (artistes
  qui apparaissent ensemble dans l'historique) et à la similarité d'albums pour
  des mix plus fins, toujours sans backend.
- **PWA hors-ligne** : coquille en cache + reprise de la file au redémarrage.
- **Déploiement** : Worker Cloudflare pour les deux proxies + assets statiques.
- **Spotify Premium** : Web Playback SDK pour la lecture complète (compte Premium
  requis), en complément des extraits.
- **Collaboratif** : playlists partagées via un petit backend (D1 + auth).

## Licence

SpotifyCraft est publié sous licence [MIT](LICENSE) — libre à chacun d'utiliser,
modifier et redistribuer.
