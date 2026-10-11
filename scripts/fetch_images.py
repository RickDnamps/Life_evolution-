#!/usr/bin/env python3
"""Télécharge des images libres de droits depuis Wikimedia Commons.

Pour chaque nœud qui a un champ `image_commons` (liste de titres « File:… »),
le script interroge l'API de Commons, garde le premier fichier qui existe et
dont la licence est libre (domaine public, CC0, CC BY, CC BY-SA), télécharge
une miniature d'environ 800 px de large, la convertit en WebP (si Pillow est
installé, sinon il garde le format d'origine), puis met à jour l'image, le
crédit, la licence et la source dans data/evolution_tree.json et CREDITS.md.

Les nœuds pour lesquels aucune image libre n'est trouvée gardent leur
illustration SVG.

Usage :
    python3 scripts/fetch_images.py              # tous les nœuds encore illustrés en SVG
    python3 scripts/fetch_images.py tiktaalik    # seulement certains nœuds
    python3 scripts/fetch_images.py --all        # retente aussi les nœuds qui ont déjà une photo
"""

import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from make_credits import write_credits

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "data", "evolution_tree.json")
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "LaGrandeAventureDeLaVie/1.0 (https://github.com/RickDnamps/Life_evolution-; site educatif)"
WIDTH = 800

FREE_LICENSE = re.compile(
    r"^(public domain|pd\b|pd-|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$)", re.IGNORECASE
)
NON_FREE = re.compile(r"\b(nc|nd|non-?commercial|no-?deriv|fair use)\b", re.IGNORECASE)


def get_json(params):
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    request = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def strip_html(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def lookup(title):
    """Renvoie les infos d'un fichier Commons, ou None s'il n'existe pas."""
    data = get_json({
        "action": "query", "titles": title, "redirects": 1, "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime", "iiurlwidth": WIDTH,
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") or not pages[0].get("imageinfo"):
        return None
    info = pages[0]["imageinfo"][0]
    meta = info.get("extmetadata", {})
    value = lambda key: strip_html(meta.get(key, {}).get("value", ""))
    return {
        "title": pages[0]["title"],
        "thumb": info.get("thumburl") or info.get("url"),
        "page": info.get("descriptionurl"),
        "mime": info.get("mime", ""),
        "license": value("LicenseShortName"),
        "artist": value("Artist") or value("Credit") or "Auteur inconnu",
        "description": value("ImageDescription"),
    }


def is_free(license_name):
    return bool(license_name) and FREE_LICENSE.search(license_name) and not NON_FREE.search(license_name)


def save_image(node_id, raw, mime):
    """Enregistre l'image en WebP si possible ; renvoie le chemin relatif."""
    try:
        from PIL import Image  # facultatif
        image = Image.open(io.BytesIO(raw))
        if image.width > WIDTH:
            image = image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        path = f"images/{node_id}.webp"
        image.save(os.path.join(ROOT, path), "WEBP", quality=80, method=6)
        return path
    except ImportError:
        extension = {"image/png": "png", "image/svg+xml": "svg", "image/gif": "gif"}.get(mime, "jpg")
        path = f"images/{node_id}.{extension}"
        with open(os.path.join(ROOT, path), "wb") as handle:
            handle.write(raw)
        return path


def main(argv):
    retry_all = "--all" in argv
    only = {a for a in argv if not a.startswith("--")}
    with open(DATA_PATH, encoding="utf-8") as handle:
        data = json.load(handle)

    found, kept = [], []
    for node in data["nodes"]:
        if only and node["id"] not in only:
            continue
        if not retry_all and not node.get("image", "").endswith(".svg"):
            continue
        for title in node.get("image_commons", []):
            try:
                info = lookup(title)
            except OSError as error:
                print(f"  ✗ {node['id']} : réseau indisponible ({error})")
                return 1
            time.sleep(0.5)  # politesse envers l'API
            if not info:
                print(f"  · {node['id']} : {title} n'existe pas")
                continue
            if not is_free(info["license"]):
                print(f"  · {node['id']} : {info['title']} refusé (licence « {info['license'] or 'inconnue'} »)")
                continue
            old_image = node.get("image", "")
            path = save_image(node["id"], download(info["thumb"]), info["mime"])
            if old_image != path and old_image.startswith("images/") and old_image.endswith(".svg"):
                old_path = os.path.join(ROOT, old_image)
                if os.path.isfile(old_path):
                    os.remove(old_path)
            node["image"] = path
            description = info["description"][:200].rstrip()
            node["image_alt"] = f"{node['name_fr']} : {description}" if description else node["name_fr"]
            node["image_credit"] = info["artist"]
            node["image_license"] = info["license"]
            node["image_source_url"] = info["page"]
            found.append(node["id"])
            print(f"  ✓ {node['id']} : {info['title']} ({info['license']})")
            break
        else:
            kept.append(node["id"])

    with open(DATA_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    write_credits(data)

    print(f"\n{len(found)} image(s) téléchargée(s), {len(kept)} nœud(s) gardent leur illustration SVG.")
    if kept:
        print("Sans image libre trouvée : " + ", ".join(kept))
    print("Pensez à relancer : python3 scripts/validate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
