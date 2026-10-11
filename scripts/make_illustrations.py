#!/usr/bin/env python3
"""Crée une illustration SVG simple pour chaque nœud qui n'a pas d'image téléchargée.

L'illustration combine l'emoji du groupe, un fond aux couleurs de l'ère où il
est apparu et quelques formes décoratives selon sa catégorie (bulles pour les
groupes aquatiques, herbes pour les groupes terrestres…). Ces dessins sont
placés dans le domaine public (CC0 1.0).

Usage :
    python3 scripts/make_illustrations.py          # seulement les nœuds dont l'image est un .svg
    python3 scripts/make_illustrations.py --force  # remplace aussi les autres images par un .svg
"""

import json
import os
import random
import sys
from xml.sax.saxutils import escape

from make_credits import write_credits

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "data", "evolution_tree.json")

CREDIT = "Illustration originale du projet La grande aventure de la vie"
LICENSE = "CC0 1.0"
SOURCE = "https://github.com/RickDnamps/Life_evolution-"

WATER = {"origine", "microbe", "invertébré", "poisson"}


def interval_color(events, mya):
    rank = {"period": 0, "era": 1, "eon": 2}
    matches = [
        e for e in events
        if e.get("type") in rank and e["start_mya"] >= mya
        and (e["end_mya"] < mya or (mya == 0 and e["end_mya"] == 0))
    ]
    matches.sort(key=lambda e: rank[e["type"]])
    for event in matches:
        if event.get("color"):
            return event["color"]
    return "#cfd8dc"


def shade(color, factor):
    """Éclaircit (factor > 0) ou assombrit (factor < 0) une couleur #rrggbb."""
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    if factor >= 0:
        r, g, b = (round(c + (255 - c) * factor) for c in (r, g, b))
    else:
        r, g, b = (round(c * (1 + factor)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def decorations(node, rng, base):
    parts = []
    if node["category"] in WATER:
        for _ in range(9):
            x, y, r = rng.randint(20, 780), rng.randint(40, 460), rng.randint(6, 22)
            parts.append(
                f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#ffffff" '
                f'stroke-opacity="0.55" stroke-width="4"/>'
            )
        parts.append(
            '<path d="M0 410 Q100 380 200 410 T400 410 T600 410 T800 410 V500 H0 Z" '
            f'fill="{shade(base, -0.18)}" fill-opacity="0.55"/>'
        )
    else:
        parts.append(
            f'<circle cx="680" cy="90" r="52" fill="#fff6c2" fill-opacity="0.9"/>'
        )
        parts.append(
            '<path d="M0 400 Q200 350 400 395 T800 380 V500 H0 Z" '
            f'fill="{shade(base, -0.25)}" fill-opacity="0.6"/>'
        )
        for _ in range(14):
            x = rng.randint(10, 790)
            height = rng.randint(18, 40)
            parts.append(
                f'<path d="M{x} 470 q4 -{height} 10 -{height + 6}" stroke="{shade(base, -0.4)}" '
                f'stroke-width="5" stroke-linecap="round" fill="none" stroke-opacity="0.5"/>'
            )
    return "\n  ".join(parts)


def make_svg(node, events):
    rng = random.Random(node["id"])  # même dessin à chaque génération
    base = interval_color(events, node["appeared_mya"])
    light, dark = shade(base, 0.45), shade(base, -0.05)
    label = escape(node["name_fr"])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="{escape(node.get('image_alt') or node['name_fr'], {'"': '&quot;'})}">
  <title>{label}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{light}"/>
      <stop offset="1" stop-color="{dark}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  {decorations(node, rng, base)}
  <circle cx="400" cy="250" r="190" fill="url(#halo)"/>
  <text x="400" y="250" font-size="220" text-anchor="middle" dominant-baseline="central"
        font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">{escape(node["emoji"])}</text>
</svg>
'''


def main(argv):
    force = "--force" in argv
    with open(DATA_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    os.makedirs(os.path.join(ROOT, "images"), exist_ok=True)

    count = 0
    for node in data["nodes"]:
        if not force and not node.get("image", "").endswith(".svg"):
            continue
        node["image"] = f"images/{node['id']}.svg"
        node["image_credit"] = CREDIT
        node["image_license"] = LICENSE
        node["image_source_url"] = SOURCE
        node["image_alt"] = f"Dessin simple : {node['name_fr']}, représenté par son emoji sur un fond aux couleurs de son ère"
        with open(os.path.join(ROOT, node["image"]), "w", encoding="utf-8") as handle:
            handle.write(make_svg(node, data.get("events", [])))
        count += 1

    with open(DATA_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    write_credits(data)
    print(f"{count} illustration(s) SVG générée(s).")


if __name__ == "__main__":
    main(sys.argv[1:])
