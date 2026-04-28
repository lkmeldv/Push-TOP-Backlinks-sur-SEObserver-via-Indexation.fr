# Push TOP Backlinks sur SEObserver via Indexation.fr

Extension Chrome (Manifest V3) qui récupère automatiquement les **Top Backlinks** d'une page SEObserver et les pousse en un clic vers [indexation.fr](https://indexation.fr) pour accélérer leur indexation Google.

> Auteur : **El Gnani Mohamed**
> Licence : MIT

---

## Sommaire

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration du token](#configuration-du-token)
- [Utilisation](#utilisation)
- [Architecture du projet](#architecture-du-projet)
- [Détails techniques](#détails-techniques)
- [Personnalisation](#personnalisation)
- [Dépannage](#dépannage)
- [Licence](#licence)

---

## Aperçu

Quand tu es sur une page SEObserver type :
`https://app.seobserver.com/sites/view/<domaine>`

L'extension :
1. Détecte le bloc `Top Backlinks` injecté par SEObserver.
2. Extrait les URLs complètes (non tronquées) via l'attribut `data-complete-string`.
3. Les pousse à indexation.fr dans un projet unique nommé **`Seobserver index top backlinks`** (créé automatiquement au premier envoi, réutilisé ensuite).

Pas besoin d'ouvrir la popup : un bouton flottant en bas à droite de la page fait tout en un clic.

---

## Fonctionnalités

- **Bouton flottant** injecté sur les pages SEObserver pour un envoi 1-clic.
- **Création automatique** du projet `Seobserver index top backlinks` côté indexation.fr (avec `auto_index: true`).
- **Cache projet** local : pas de re-création / re-recherche à chaque envoi.
- **Popup** d'extension complète avec :
  - Solde crédits en temps réel.
  - Sélection manuelle d'un autre projet (override).
  - Choix du Top N (max 1000 par envoi, batché par 500).
  - Aperçu des URLs détectées.
  - Réglage du token API.
- **Filtrage propre** : seules les URLs présentes dans `#site_view_top_backlinks` sont prises en compte (URLs complètes, dédoublonnées).
- **Toasts colorés** : info / succès / erreur visibles directement sur la page.
- **Animation pulse** sur le bouton pendant l'envoi.

---

## Prérequis

- Google Chrome (ou tout navigateur Chromium : Brave, Edge, Arc...).
- Un compte SEObserver actif.
- Un compte indexation.fr et un **token API** ([générable depuis le dashboard](https://indexation.fr)).

---

## Installation

### Méthode 1 : depuis ce repo

```bash
git clone https://github.com/<ton-user>/Push-TOP-Backlinks-sur-SEObserver-via-Indexation.fr.git
cd Push-TOP-Backlinks-sur-SEObserver-via-Indexation.fr
```

### Méthode 2 : ZIP

Télécharge l'archive et dézippe-la.

### Charger l'extension dans Chrome

1. Ouvre `chrome://extensions/`.
2. Active **Mode développeur** (toggle en haut à droite).
3. Clique **Charger l'extension non empaquetée**.
4. Sélectionne le dossier de l'extension.
5. L'icône bleue apparaît dans la barre d'outils.

---

## Configuration du token

Au premier lancement, tu dois renseigner ton token API indexation.fr :

1. Clique sur l'icône de l'extension dans la barre d'outils.
2. Déroule **Réglages**.
3. Colle ton token (format `Bearer ...` sans le préfixe "Bearer").
4. Clique **Enregistrer**.

Le token est stocké dans `chrome.storage.sync` (synchronisé entre tes appareils Chrome connectés au même compte Google).

> **Sécurité** : aucun token n'est hardcodé dans le code source. L'extension refuse les appels API tant que le token n'est pas configuré.

---

## Utilisation

### Workflow rapide (recommandé)

1. Va sur `https://app.seobserver.com/sites/view/<domaine>`.
2. Attends le chargement du tableau **Top Backlinks**.
3. Clique le bouton flottant **"Indexer top backlinks"** en bas à droite.
4. Un toast affiche le résultat : `OK - X URLs envoyees au projet "Seobserver index top backlinks"`.

### Workflow avancé (popup)

Ouvre l'icône de l'extension pour :
- Voir le **solde de crédits** indexation.fr.
- Choisir un **projet différent** que celui par défaut.
- Limiter le **Top N** (par défaut 100).
- Inspecter les URLs détectées avant envoi.
- Cliquer **Envoyer à indexation.fr**.

---

## Architecture du projet

```
.
├── manifest.json          Manifest V3 + permissions
├── background.js          Service worker (appels API indexation.fr)
├── content.js             Scraping SEObserver + bouton flottant
├── content.css            Style du bouton flottant et toasts
├── popup.html             UI extension
├── popup.css              Style popup (thème sombre)
├── popup.js               Logique popup
├── icons/                 Icônes 16 / 48 / 128
├── LICENSE                Licence MIT
└── README.md              Ce fichier
```

---

## Détails techniques

### Scraping SEObserver

Le scraper cible précisément le conteneur :

```html
<div id="site_view_top_backlinks" data-site-id="<domaine>">
```

Pour chaque ligne, il lit l'attribut `data-complete-string` qui contient l'URL **complète et non tronquée**, contrairement au texte de l'`<a>` qui est abrégé. Fallback sur les anchors `a.lasturl[href^='http']` si le data-attribute manque.

### API indexation.fr

Endpoints utilisés :

| Méthode | Endpoint | Usage |
|---------|----------|-------|
| `GET` | `/api/v1/projects` | Liste des projets (paginée) |
| `POST` | `/api/v1/projects` | Création du projet par défaut |
| `POST` | `/api/v1/urls` | Push des URLs (batché 500 max) |
| `GET` | `/api/v1/credits/transactions` | Solde réel (`balance_after`) |

> Note : `/api/v1/credits/balance` retourne `0` côté API (bug connu). On utilise donc `balance_after` de la dernière transaction comme source de vérité.

### Coût

- **1 crédit** par URL poussée.
- **0.01 crédit** par check SERP (auto si `auto_index: true`).
- Refund de 99% si l'URL n'est pas indexée sous 14 jours.

---

## Personnalisation

### Changer le nom du projet par défaut

Édite `background.js` :

```js
const PROJECT_NAME = "Seobserver index top backlinks"; // <- ici
```

### Adapter le sélecteur SEObserver

Si SEObserver change la structure DOM, édite `content.js` :

```js
const CONTAINER_SELECTOR = "#site_view_top_backlinks";
```

### Augmenter le Top N

Dans la popup, le champ `Top N` accepte de 1 à 1000 par envoi. Au-delà, l'API rejette le batch.

---

## Dépannage

| Problème | Cause probable | Solution |
|----------|----------------|----------|
| Toast `Bloc Top Backlinks introuvable` | Page mal chargée ou structure DOM modifiée | Recharge la page, attends le tableau, vérifie `#site_view_top_backlinks` dans l'inspecteur |
| Toast `Token API manquant` | Pas de token configuré | Popup > Réglages > coller le token |
| Toast `HTTP 401` | Token invalide / expiré | Régénère un token sur indexation.fr et mets à jour |
| Solde affiché `?` | Erreur API ou token absent | Vérifie token et connexion |
| Le bouton flottant n'apparaît pas | Extension désactivée ou page non SEObserver | Recharge la page, vérifie `chrome://extensions/` |

Pour debug avancé : ouvre la console DevTools (F12) sur la page SEObserver et regarde les logs `chrome-extension://...`.

---

## Licence

[MIT](./LICENSE) © 2026 El Gnani Mohamed

---

## Auteur

**El Gnani Mohamed**
- Outil créé pour le workflow netlinking SEO
- Compatible avec [Linkuma](https://www.linkuma.com)
