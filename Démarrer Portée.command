#!/bin/bash
# Double-cliquez sur ce fichier pour lancer Portée.
cd "$(dirname "$0")" || exit 1

if [ ! -d node_modules ]; then
  echo "Installation des dépendances (première fois uniquement)…"
  npm install || exit 1
fi

echo "Portée démarre : votre navigateur va s'ouvrir sur le serveur local."
echo "Pour arrêter : Ctrl+C dans cette fenêtre, ou fermez-la."
npm run dev -- --open