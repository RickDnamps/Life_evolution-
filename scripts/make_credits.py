#!/usr/bin/env python3
"""Régénère CREDITS.md à partir de data/evolution_tree.json.

Usage :
    python3 scripts/make_credits.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "data", "evolution_tree.json")
CREDITS_PATH = os.path.join(ROOT, "CREDITS.md")


def md_escape(text):
    return str(text).replace("|", "\\|").replace("\n", " ").strip()


def write_credits(data, path=CREDITS_PATH):
    nodes = data["nodes"]
    lines = [
        "# Crédits des images",
        "",
        "Toutes les images du site sont libres de droits : domaine public, CC0, CC BY ou CC BY-SA.",
        "Ce fichier est généré par `scripts/make_credits.py` à partir de `data/evolution_tree.json`.",
        "",
        "| Groupe | Image | Auteur | Licence | Source |",
        "|---|---|---|---|---|",
    ]
    for node in nodes:
        lines.append(
            "| {name} | `{image}` | {credit} | {license} | {source} |".format(
                name=md_escape(f"{node.get('emoji', '')} {node['name_fr']}"),
                image=md_escape(node.get("image", "")),
                credit=md_escape(node.get("image_credit", "")),
                license=md_escape(node.get("image_license", "")),
                source=f"[lien]({node['image_source_url']})" if node.get("image_source_url") else "",
            )
        )
    lines += [
        "",
        "Les illustrations originales du projet (fichiers `.svg`) sont placées dans le domaine public (CC0 1.0).",
        "",
        "Les contours des continents du globe de l'accueil viennent de [Natural Earth](https://www.naturalearthdata.com/) (domaine public).",
        "",
    ]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    with open(DATA_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    write_credits(data)
    print(f"CREDITS.md régénéré ({len(data['nodes'])} images).")


if __name__ == "__main__":
    main()
