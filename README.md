# 🌍 La grande aventure de la vie sur Terre

Un site web éducatif, en français, qui raconte l'évolution de la vie sur Terre aux enfants de l'école primaire : de la première cellule, il y a 3,7 milliards d'années, jusqu'à nous.

Le site est beau, coloré et interactif, et il reste scientifiquement exact. Chaque date est accompagnée de sa source.

**➡️ Voir le site : https://rickdnamps.github.io/Life_evolution-/**

## Aperçu

| Activité | Ce qu'on y fait |
|---|---|
| 🌋 **Le grand début** | L'histoire avant les animaux, en 7 chapitres animés : le nuage d'où naît le Soleil, la Terre de lave, la naissance de la Lune, les premiers océans, la « recette de la vie », LUCA et les premières traces de vie. |
| 🌳 **Arbre de la vie** | Un arbre phylogénétique dépliable : la flèche ▸ dévoile les descendants d'un groupe, et les boutons « Tout ouvrir » et « Tout fermer » ouvrent ou referment tout l'arbre. |
| 📖 **Fiche détaillée** | Une grande image, une description pour les enfants, un fait étonnant, l'âge et l'ère. La flèche « Pour les curieux » dit ce que le groupe mangeait, où il vivait, sa taille et son super-pouvoir, et pose une question à méditer. On y trouve aussi sa famille (ancêtres, descendants, groupes frères) et le bouton « En savoir plus » pour la version adulte et la source. |
| 🕰️ **Ligne du temps** | Une frise horizontale en segments, pour voir à la fois 3 700 millions d'années et 300 000 ans. Les ères sont colorées et les cinq grandes extinctions sont marquées. |
| ⏰ **La Terre en 24 heures** | Une horloge montre à quelle heure chaque groupe apparaît. Les humains arrivent dans les toutes dernières secondes ! |
| 🧬 **Le voyage de tes ancêtres** | On remonte la lignée humaine étape par étape et on découvre ce qu'on a hérité de chaque ancêtre : la colonne vertébrale, les doigts, le coccyx… |
| 🤔 **Qui est apparu en premier ?** | Deux groupes tirés au hasard : l'enfant devine, puis le jeu explique leur lien de parenté. |
| ❓ **Quiz** | 10 questions tirées dans une banque de 30, avec un score et des encouragements. |
| 🚀 **Remonter le temps** | « Si tu remontais le temps d'un an par seconde, il te faudrait… » |

Le site a aussi un mode sombre et une recherche par nom. Il se parcourt entièrement au clavier, toutes les images ont un texte alternatif, et il s'affiche bien sur téléphone, tablette et ordinateur.

## Organisation du projet

```
index.html                  page unique du site
css/                        styles (style.css commun + un fichier par activité)
js/                         modules JavaScript (vanilla, sans framework ni étape de build)
  app.js                    chargement des données, navigation, recherche, thème
  validate.js               même validation que scripts/validate.py, dans le navigateur
data/evolution_tree.json    LA source de vérité : arbre, ères, extinctions, quiz, « Le grand début »
data/SCHEMA.md              description de chaque champ
images/                     images des groupes (WebP ou illustrations SVG)
scripts/validate.py         validateur (Python, bibliothèque standard seulement)
scripts/test_validate.py    tests du validateur
scripts/fetch_images.py     télécharge les images libres depuis Wikimedia Commons
scripts/make_illustrations.py  crée les illustrations SVG de secours
scripts/make_credits.py     régénère CREDITS.md
CREDITS.md                  auteurs et licences de toutes les images
```

## Voir le site sur son ordinateur

Le site charge `data/evolution_tree.json`. Il faut donc l'ouvrir avec un petit serveur web, et non en double-cliquant sur `index.html` :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Lancer la validation

```bash
python3 scripts/validate.py
```

Le validateur vérifie :

- les identifiants sont uniques, chaque `parent_id` existe, il y a une seule racine et aucun cycle ;
- **aucun descendant n'apparaît avant son ancêtre** (`enfant.appeared_mya <= parent.appeared_mya`) ;
- les champs obligatoires sont présents et bien typés, et `category` fait partie de la liste permise ;
- chaque image existe et a un crédit et une licence ;
- les ères, les extinctions, le quiz et les chapitres du « Grand début » sont bien formés.

En cas d'erreur, il affiche le chemin complet du nœud fautif (par exemple `vie › animaux › bilateriens › vertebres`) et les dates en conflit, puis se termine avec un code non nul. Dans la page, un nœud invalide porte un badge rouge.

Pour tester le validateur lui-même :

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
```

## Ajouter un nœud

1. Ouvrir `data/evolution_tree.json` et ajouter un objet dans la liste `nodes`. Tous les champs sont décrits dans [`data/SCHEMA.md`](data/SCHEMA.md). Voici un exemple minimal :

   ```json
   {
     "id": "mammouths",
     "name_fr": "Mammouths",
     "name_sci": "Mammuthus",
     "appeared_mya": 5,
     "extinct_mya": 0.004,
     "parent_id": "elephants",
     "category": "mammifère",
     "description": "Version adulte, 2 ou 3 phrases.",
     "description_enfant": "Version pour enfants, 1 ou 2 phrases.",
     "fun_fact": "Un fait étonnant.",
     "emoji": "🦣",
     "image": "images/mammouths.svg",
     "image_alt": "Illustration d'un mammouth",
     "image_credit": "Illustration originale du projet La grande aventure de la vie",
     "image_license": "CC0 1.0",
     "image_source_url": "https://github.com/RickDnamps/Life_evolution-",
     "image_commons": ["File:Nom du fichier sur Wikimedia Commons.jpg"],
     "era": "Cénozoïque · Néogène",
     "source": "Fossile de référence, publication ou page de référence",
     "details": {
       "alimentation": "…", "habitat": "…", "taille": "…",
       "super_pouvoir": "…", "aujourdhui": "…",
       "question": { "question": "…", "reponse": "…" }
     }
   }
   ```

   L'arbre est **phylogénétique** : un nœud a pour parent le groupe qui contient à la fois ce nœud et ses plus proches cousins. Par exemple, les cétacés et les hippopotames sont des groupes frères, tous les deux enfants des whippomorphes.

2. Créer son illustration SVG (avec l'emoji et la couleur de l'ère) :

   ```bash
   python3 scripts/make_illustrations.py
   ```

3. Si possible, remplacer l'illustration par une vraie image libre de droits venant de Wikimedia Commons. Le script vérifie la licence, convertit l'image en WebP d'environ 800 px de large, met à jour le JSON et régénère `CREDITS.md` :

   ```bash
   python3 scripts/fetch_images.py mammouths
   ```

4. Valider, puis faire un commit :

   ```bash
   python3 scripts/validate.py
   ```

## Images

Seules des images libres de droits sont utilisées : domaine public, CC0, CC BY ou CC BY-SA. Elles sont téléchargées dans `images/`, sans hotlinking. Quand aucune image libre n'est disponible, le site affiche une illustration SVG originale, placée dans le domaine public. Tous les crédits figurent dans [`CREDITS.md`](CREDITS.md) et dans le JSON.

## Déploiement

Le workflow `.github/workflows/deploy.yml` s'exécute à chaque push :

1. il lance `scripts/validate.py` et les tests du validateur ;
2. si la validation échoue, rien n'est déployé ;
3. si elle réussit et que le push est sur `main`, le site est publié sur GitHub Pages.

## Sources scientifiques

Chaque nœud indique sa source : Wikipédia, Smithsonian, UCMP Berkeley, Muséum national d'histoire naturelle, ou articles de *Nature* et *Science*. Les dates sont les meilleures estimations actuelles. Quand les scientifiques en discutent encore, la fiche le dit.
