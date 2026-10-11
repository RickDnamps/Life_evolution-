# Format de `data/evolution_tree.json`

Ce fichier est la **seule source de vérité** du site. Il contient quatre clés :

```json
{
  "meta":   { ... },
  "nodes":  [ ... ],
  "events": [ ... ],
  "quiz":   [ ... ]
}
```

## `nodes` : l'arbre phylogénétique

Chaque nœud est un **groupe d'êtres vivants** (pas un événement). L'arbre est
phylogénétique : deux groupes frères partagent un nœud ancêtre commun.

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | texte | oui | Identifiant unique, en minuscules, sans accent (`[a-z0-9_]+`). |
| `name_fr` | texte | oui | Nom en français, pour les enfants. |
| `name_sci` | texte | oui | Nom scientifique du groupe (ex. `Cetacea`). |
| `appeared_mya` | nombre | oui | Apparition, en millions d'années (Ma). Plus vieux fossile largement accepté ; si le groupe n'a presque pas de fossiles, date estimée de séparation d'avec son groupe frère. |
| `extinct_mya` | nombre ou `null` | non | Disparition, en Ma. `null` ou absent si le groupe vit encore. |
| `parent_id` | texte ou `null` | oui | `id` du nœud parent ; `null` pour la seule racine. |
| `category` | texte | oui | Une valeur parmi : `origine`, `microbe`, `invertébré`, `poisson`, `amphibien`, `reptile`, `dinosaure`, `oiseau`, `mammifère`, `primate`, `humain`. |
| `description` | texte | oui | Version adulte, 2 ou 3 phrases. |
| `description_enfant` | texte | oui | Version enfant, 1 ou 2 phrases, ton chaleureux, tutoiement. |
| `fun_fact` | texte | oui | Un fait étonnant pour les enfants. |
| `emoji` | texte | oui | Un emoji représentatif. |
| `image` | texte | oui | Chemin relatif vers l'image (ex. `images/tiktaalik.webp`). Le fichier doit exister. |
| `image_alt` | texte | oui | Texte alternatif décrivant l'image. |
| `image_credit` | texte | oui | Auteur de l'image. |
| `image_license` | texte | oui | Licence (ex. `CC BY-SA 4.0`, `Domaine public`, `CC0 1.0`). |
| `image_source_url` | texte | oui | Page d'origine de l'image. |
| `image_commons` | liste de textes | non | Titres de fichiers Wikimedia Commons candidats (ex. `File:Tiktaalik BW.jpg`), utilisés par `scripts/fetch_images.py`. |
| `era` | texte | oui | Ère et période, au format `Ère · Période` (ex. `Paléozoïque · Dévonien`). Pour le Précambrien : `Éon · Ère` (ex. `Protérozoïque · Paléoprotérozoïque`). |
| `source` | texte | oui | Référence scientifique de la date (fossile de référence + source). |
| `source_url` | texte | non | Lien vers la source. |
| `details` | objet | non | « Pour les curieux », voir ci-dessous. |
| `heritage` | texte | non | Pour les ancêtres de l'humain : ce que tu as hérité de ce groupe (affiché dans « Le voyage de tes ancêtres »). |

### `details` : la flèche « Pour les curieux »

Toutes les clés sont facultatives ; chaque valeur est **une phrase courte pour enfant**.

| Clé | Contenu |
|---|---|
| `alimentation` | Ce qu'il mange ou mangeait. |
| `habitat` | Où il vit ou vivait. |
| `taille` | Sa taille, comparée à quelque chose que l'enfant connaît. |
| `super_pouvoir` | L'invention de l'évolution qui le rend spécial. |
| `aujourdhui` | Ce qu'il en reste aujourd'hui : descendants ou cousins vivants. |
| `question` | Objet `{ "question": "...", "reponse": "..." }` : une question qui pique la curiosité, avec sa réponse. |

## `events` : ères, périodes et grands événements

| Champ | Type | Description |
|---|---|---|
| `id` | texte | Identifiant unique. |
| `type` | texte | `eon`, `era`, `period`, `extinction` ou `event`. |
| `name_fr` | texte | Nom en français. |
| `start_mya` | nombre | Début (Ma). |
| `end_mya` | nombre | Fin (Ma). Pour un événement ponctuel, égal à `start_mya`. |
| `parent_id` | texte ou `null` | Pour une période, l'id de son ère ; pour une ère, l'id de son éon. |
| `color` | texte ou `null` | Couleur d'affichage (`#rrggbb`), pour les éons, ères et périodes. |
| `description_enfant` | texte | Une ou deux phrases pour enfant. |
| `source` | texte | Référence. |

## `quiz` : banque de questions

| Champ | Type | Description |
|---|---|---|
| `id` | texte | Identifiant unique. |
| `question` | texte | La question. |
| `choices` | liste de textes | 3 ou 4 réponses possibles. |
| `answer` | nombre | Indice (à partir de 0) de la bonne réponse dans `choices`. |
| `explanation` | texte | Explication affichée après la réponse. |
| `node_id` | texte ou `null` | Nœud lié, pour ouvrir sa fiche. |
