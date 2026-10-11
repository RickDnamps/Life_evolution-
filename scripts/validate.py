#!/usr/bin/env python3
"""Valide data/evolution_tree.json.

Usage :
    python3 scripts/validate.py [chemin/vers/evolution_tree.json]

Le script affiche un rapport et se termine avec le code 1 s'il trouve au
moins une erreur. Seule la bibliothèque standard est utilisée.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PATH = os.path.join(ROOT, "data", "evolution_tree.json")

CATEGORIES = [
    "origine", "microbe", "invertébré", "poisson", "amphibien", "reptile",
    "dinosaure", "oiseau", "mammifère", "primate", "humain",
]
EVENT_TYPES = ["eon", "era", "period", "extinction", "event"]
DETAIL_KEYS = ["alimentation", "habitat", "taille", "super_pouvoir", "aujourdhui"]

ID_RE = re.compile(r"^[a-z0-9_]+$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

# (champ, types acceptés, obligatoire)
NODE_FIELDS = [
    ("id", (str,), True),
    ("name_fr", (str,), True),
    ("name_sci", (str,), True),
    ("appeared_mya", (int, float), True),
    ("extinct_mya", (int, float, type(None)), False),
    ("parent_id", (str, type(None)), True),
    ("category", (str,), True),
    ("description", (str,), True),
    ("description_enfant", (str,), True),
    ("fun_fact", (str,), True),
    ("emoji", (str,), True),
    ("image", (str,), True),
    ("image_alt", (str,), True),
    ("image_credit", (str,), True),
    ("image_license", (str,), True),
    ("image_source_url", (str,), True),
    ("image_commons", (list,), False),
    ("era", (str,), True),
    ("source", (str,), True),
    ("source_url", (str,), False),
    ("details", (dict,), False),
    ("heritage", (str,), False),
]

EVENT_FIELDS = [
    ("id", (str,), True),
    ("type", (str,), True),
    ("name_fr", (str,), True),
    ("start_mya", (int, float), True),
    ("end_mya", (int, float), True),
    ("parent_id", (str, type(None)), False),
    ("color", (str, type(None)), False),
    ("emoji", (str,), False),
    ("description_enfant", (str,), True),
    ("source", (str,), True),
]

STORY_SCENES = ["nebuleuse", "lave", "lune", "ocean", "recette", "luca", "microbes"]

STORY_FIELDS = [
    ("id", (str,), True),
    ("title", (str,), True),
    ("mya", (int, float), True),
    ("date_label", (str,), False),
    ("emoji", (str,), True),
    ("scene", (str,), True),
    ("text_enfant", (str,), True),
    ("fun_fact", (str,), True),
    ("question", (dict,), False),
    ("node_id", (str, type(None)), False),
    ("source", (str,), True),
    ("source_url", (str,), False),
]

QUIZ_FIELDS = [
    ("id", (str,), True),
    ("question", (str,), True),
    ("choices", (list,), True),
    ("answer", (int,), True),
    ("explanation", (str,), True),
    ("node_id", (str, type(None)), False),
]


def type_name(types):
    names = {
        str: "texte", int: "nombre", float: "nombre", list: "liste",
        dict: "objet", type(None): "null",
    }
    return " ou ".join(sorted({names[t] for t in types}))


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def check_fields(obj, fields, label, errors):
    """Vérifie la présence et le type des champs ; renvoie False si obj n'est pas un objet."""
    if not isinstance(obj, dict):
        errors.append(f"{label} : doit être un objet JSON")
        return False
    for name, types, required in fields:
        if name not in obj:
            if required:
                errors.append(f"{label} : champ obligatoire « {name} » manquant")
            continue
        value = obj[name]
        if isinstance(value, bool) or not isinstance(value, types):
            errors.append(
                f"{label} : « {name} » doit être de type {type_name(types)}"
                f" (reçu : {json.dumps(value, ensure_ascii=False)[:60]})"
            )
        elif isinstance(value, str) and required and not value.strip():
            errors.append(f"{label} : « {name} » est vide")
    return True


def fmt_mya(value):
    return f"{value:g} Ma" if is_number(value) else str(value)


class TreeReport:
    def __init__(self, data, base_dir):
        self.data = data
        self.base_dir = base_dir
        self.errors = []
        self.warnings = []
        self.nodes = {}

    # Chemin lisible d'un nœud : vie › eucaryotes › animaux › ...
    def path(self, node_id):
        parts, seen = [], set()
        current = node_id
        while current is not None and current not in seen:
            seen.add(current)
            parts.append(current)
            node = self.nodes.get(current)
            current = node.get("parent_id") if isinstance(node, dict) else None
        return " › ".join(reversed(parts))

    def run(self):
        if not isinstance(self.data, dict):
            self.errors.append("Le fichier doit contenir un objet JSON à la racine")
            return
        for key in ("meta", "nodes", "events", "quiz"):
            if key not in self.data:
                self.errors.append(f"Clé racine « {key} » manquante")
        self.check_nodes(self.data.get("nodes", []))
        self.check_events(self.data.get("events", []))
        self.check_quiz(self.data.get("quiz", []))
        self.check_story(self.data.get("story", []))

    def check_nodes(self, nodes):
        if not isinstance(nodes, list) or not nodes:
            self.errors.append("« nodes » doit être une liste non vide")
            return

        valid = []
        for index, node in enumerate(nodes):
            label = f"Nœud n° {index + 1}"
            if isinstance(node, dict) and isinstance(node.get("id"), str):
                label = f"Nœud « {node['id']} »"
            if not check_fields(node, NODE_FIELDS, label, self.errors):
                continue
            node_id = node.get("id")
            if not isinstance(node_id, str):
                continue
            if not ID_RE.match(node_id):
                self.errors.append(f"{label} : id invalide (lettres minuscules, chiffres et _ seulement)")
            if node_id in self.nodes:
                self.errors.append(f"{label} : id en double")
                continue
            self.nodes[node_id] = node
            valid.append(node)

        roots = [n["id"] for n in valid if n.get("parent_id") is None]
        if len(roots) != 1:
            listed = ", ".join(roots) if roots else "aucune"
            self.errors.append(f"L'arbre doit avoir exactement une racine (trouvé : {listed})")

        for node in valid:
            node_id = node["id"]
            where = self.path(node_id)
            parent_id = node.get("parent_id")

            if parent_id is not None and parent_id not in self.nodes:
                self.errors.append(f"[{where}] parent_id « {parent_id} » n'existe pas")

            category = node.get("category")
            if isinstance(category, str) and category not in CATEGORIES:
                self.errors.append(
                    f"[{where}] catégorie « {category} » non permise"
                    f" (valeurs : {', '.join(CATEGORIES)})"
                )

            appeared = node.get("appeared_mya")
            if is_number(appeared) and appeared < 0:
                self.errors.append(f"[{where}] appeared_mya négatif ({fmt_mya(appeared)})")

            extinct = node.get("extinct_mya")
            if is_number(extinct) and is_number(appeared):
                if extinct < 0:
                    self.errors.append(f"[{where}] extinct_mya négatif ({fmt_mya(extinct)})")
                if extinct > appeared:
                    self.errors.append(
                        f"[{where}] disparaît ({fmt_mya(extinct)}) avant d'apparaître"
                        f" ({fmt_mya(appeared)})"
                    )

            self.check_image(node, where)
            self.check_details(node.get("details"), where)

        self.check_cycles(valid)
        self.check_dates(valid)
        self.check_eras(valid)

    def check_cycles(self, nodes):
        reported = set()
        for node in nodes:
            seen = []
            current = node["id"]
            while current is not None and current in self.nodes:
                if current in seen:
                    cycle = seen[seen.index(current):] + [current]
                    key = frozenset(cycle)
                    if key not in reported:
                        reported.add(key)
                        self.errors.append("Cycle dans l'arbre : " + " → ".join(cycle))
                    break
                seen.append(current)
                current = self.nodes[current].get("parent_id")

    def check_dates(self, nodes):
        for node in nodes:
            parent = self.nodes.get(node.get("parent_id"))
            if parent is None:
                continue
            child_age = node.get("appeared_mya")
            parent_age = parent.get("appeared_mya")
            if is_number(child_age) and is_number(parent_age) and child_age > parent_age:
                self.errors.append(
                    f"[{self.path(node['id'])}] apparaît avant son ancêtre : "
                    f"« {node['id']} » = {fmt_mya(child_age)} > "
                    f"« {parent['id']} » = {fmt_mya(parent_age)}"
                )

    def check_eras(self, nodes):
        """Avertit si le champ `era` ne correspond pas aux intervalles de `events`."""
        events = [e for e in self.data.get("events", []) if isinstance(e, dict)]
        intervals = [
            e for e in events
            if e.get("type") in ("eon", "era", "period")
            and is_number(e.get("start_mya")) and is_number(e.get("end_mya"))
        ]
        if not intervals:
            return
        for node in nodes:
            mya, era = node.get("appeared_mya"), node.get("era")
            if not is_number(mya) or not isinstance(era, str):
                continue
            names = {
                e.get("name_fr") for e in intervals
                if e["start_mya"] >= mya and (e["end_mya"] < mya or (mya == 0 and e["end_mya"] == 0))
            }
            unknown = [part.strip() for part in era.split("·") if part.strip() not in names]
            if unknown:
                self.warnings.append(
                    f"[{self.path(node['id'])}] era « {era} » ne correspond pas à {fmt_mya(mya)}"
                    f" (intervalles : {', '.join(sorted(n for n in names if n))})"
                )

    def check_image(self, node, where):
        image = node.get("image")
        if isinstance(image, str) and image.strip():
            if image.startswith(("http://", "https://", "//")):
                self.errors.append(f"[{where}] l'image doit être un fichier local, pas un lien ({image})")
            elif not os.path.isfile(os.path.join(self.base_dir, image)):
                self.errors.append(f"[{where}] fichier image introuvable : {image}")
        for field in ("image_credit", "image_license"):
            value = node.get(field)
            if isinstance(value, str) and not value.strip():
                self.errors.append(f"[{where}] « {field} » est vide")

    def check_details(self, details, where):
        if not isinstance(details, dict):
            return
        for key, value in details.items():
            if key in DETAIL_KEYS:
                if not isinstance(value, str) or not value.strip():
                    self.errors.append(f"[{where}] details.{key} doit être un texte non vide")
            elif key == "question":
                ok = (
                    isinstance(value, dict)
                    and isinstance(value.get("question"), str) and value["question"].strip()
                    and isinstance(value.get("reponse"), str) and value["reponse"].strip()
                )
                if not ok:
                    self.errors.append(
                        f"[{where}] details.question doit contenir « question » et « reponse »"
                    )
            else:
                self.warnings.append(f"[{where}] clé details.{key} inconnue (ignorée par le site)")

    def check_events(self, events):
        if not isinstance(events, list):
            self.errors.append("« events » doit être une liste")
            return
        ids = {}
        for index, event in enumerate(events):
            label = f"Événement n° {index + 1}"
            if isinstance(event, dict) and isinstance(event.get("id"), str):
                label = f"Événement « {event['id']} »"
            if not check_fields(event, EVENT_FIELDS, label, self.errors):
                continue
            event_id = event.get("id")
            if isinstance(event_id, str):
                if event_id in ids:
                    self.errors.append(f"{label} : id en double")
                ids[event_id] = event
            if event.get("type") not in EVENT_TYPES:
                self.errors.append(f"{label} : type « {event.get('type')} » non permis")
            start, end = event.get("start_mya"), event.get("end_mya")
            if is_number(start) and is_number(end) and end > start:
                self.errors.append(
                    f"{label} : la fin ({fmt_mya(end)}) est plus ancienne que le début ({fmt_mya(start)})"
                )
            color = event.get("color")
            if isinstance(color, str) and not COLOR_RE.match(color):
                self.errors.append(f"{label} : couleur « {color} » invalide (format #rrggbb)")
        for event in ids.values():
            parent_id = event.get("parent_id")
            if parent_id is not None and parent_id not in ids:
                self.errors.append(f"Événement « {event['id']} » : parent_id « {parent_id} » n'existe pas")

    def check_quiz(self, quiz):
        if not isinstance(quiz, list):
            self.errors.append("« quiz » doit être une liste")
            return
        if len(quiz) < 10:
            self.errors.append(f"Le quiz doit contenir au moins 10 questions (trouvé : {len(quiz)})")
        ids = set()
        for index, item in enumerate(quiz):
            label = f"Question n° {index + 1}"
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                label = f"Question « {item['id']} »"
            if not check_fields(item, QUIZ_FIELDS, label, self.errors):
                continue
            if item.get("id") in ids:
                self.errors.append(f"{label} : id en double")
            ids.add(item.get("id"))
            choices = item.get("choices")
            if isinstance(choices, list):
                if not 2 <= len(choices) <= 4 or not all(isinstance(c, str) and c.strip() for c in choices):
                    self.errors.append(f"{label} : « choices » doit contenir 2 à 4 textes non vides")
                answer = item.get("answer")
                if isinstance(answer, int) and not 0 <= answer < len(choices):
                    self.errors.append(f"{label} : « answer » ({answer}) hors des choix")
            node_id = item.get("node_id")
            if isinstance(node_id, str) and node_id not in self.nodes:
                self.errors.append(f"{label} : node_id « {node_id} » n'existe pas")


    def check_story(self, story):
        """Chapitres du « Grand début » : facultatifs, mais bien formés et dans l'ordre du temps."""
        if not isinstance(story, list):
            self.errors.append("« story » doit être une liste")
            return
        ids, previous = set(), None
        for index, chapter in enumerate(story):
            label = f"Chapitre n° {index + 1}"
            if isinstance(chapter, dict) and isinstance(chapter.get("id"), str):
                label = f"Chapitre « {chapter['id']} »"
            if not check_fields(chapter, STORY_FIELDS, label, self.errors):
                continue
            if chapter.get("id") in ids:
                self.errors.append(f"{label} : id en double")
            ids.add(chapter.get("id"))
            if chapter.get("scene") not in STORY_SCENES:
                self.errors.append(
                    f"{label} : scène « {chapter.get('scene')} » inconnue (valeurs : {', '.join(STORY_SCENES)})"
                )
            mya = chapter.get("mya")
            if is_number(mya):
                if previous is not None and mya > previous[1]:
                    self.errors.append(
                        f"{label} : les chapitres doivent aller du plus ancien au plus récent"
                        f" ({fmt_mya(mya)} après « {previous[0]} » = {fmt_mya(previous[1])})"
                    )
                previous = (chapter.get("id"), mya)
            question = chapter.get("question")
            if isinstance(question, dict) and not (
                isinstance(question.get("question"), str) and question["question"].strip()
                and isinstance(question.get("reponse"), str) and question["reponse"].strip()
            ):
                self.errors.append(f"{label} : « question » doit contenir « question » et « reponse »")
            node_id = chapter.get("node_id")
            if isinstance(node_id, str) and node_id not in self.nodes:
                self.errors.append(f"{label} : node_id « {node_id} » n'existe pas")


def main(argv):
    path = os.path.abspath(argv[1]) if len(argv) > 1 else DEFAULT_PATH
    print(f"Validation de {os.path.relpath(path, os.getcwd())}")

    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        print(f"✗ Fichier introuvable : {path}")
        return 1
    except json.JSONDecodeError as error:
        print(f"✗ JSON invalide : ligne {error.lineno}, colonne {error.colno} : {error.msg}")
        return 1

    # Les chemins d'images sont relatifs à la racine du site (le dossier parent de data/).
    report = TreeReport(data, os.path.dirname(os.path.dirname(path)))
    report.run()

    nodes = data.get("nodes", []) if isinstance(data, dict) else []
    events = data.get("events", []) if isinstance(data, dict) else []
    quiz = data.get("quiz", []) if isinstance(data, dict) else []
    story = data.get("story", []) if isinstance(data, dict) else []
    print(
        f"  {len(nodes)} nœuds, {len(events)} événements, {len(quiz)} questions de quiz,"
        f" {len(story)} chapitres du « Grand début »"
    )

    for warning in report.warnings:
        print(f"  ⚠ {warning}")

    if report.errors:
        print(f"\n✗ {len(report.errors)} erreur(s) :")
        for error in report.errors:
            print(f"  - {error}")
        return 1

    print("✓ Tout est valide.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
