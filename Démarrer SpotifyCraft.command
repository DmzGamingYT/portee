#!/bin/bash
# Double-cliquez sur ce fichier pour lancer SpotifyCraft.
cd "$(dirname "$0")" || exit 1

if [ ! -d node_modules ]; then
  echo "Installation des dépendances (première fois uniquement)…"
  npm install || exit 1
fi

echo "SpotifyCraft démarre : votre navigateur va s'ouvrir sur le serveur local."
echo "Pour arrêter : Ctrl+C dans cette fenêtre, ou fermez-la."
npm run dev -- --open