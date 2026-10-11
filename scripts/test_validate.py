"""Tests du validateur (bibliothèque standard seulement).

    python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate import TreeReport  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REAL_DATA = os.path.join(ROOT, "data", "evolution_tree.json")


def make_node(node_id, parent_id, mya, **extra):
    node = {
        "id": node_id, "name_fr": node_id, "name_sci": node_id, "appeared_mya": mya,
        "parent_id": parent_id, "category": "poisson", "description": "d", "description_enfant": "d",
        "fun_fact": "f", "emoji": "🐟", "image": "img.svg", "image_alt": "a", "image_credit": "c",
        "image_license": "CC0 1.0", "image_source_url": "https://example.org", "era": "e", "source": "s",
    }
    node.update(extra)
    return node


def make_data(nodes):
    quiz = [
        {"id": f"q{i}", "question": "?", "choices": ["a", "b", "c"], "answer": 0, "explanation": "e"}
        for i in range(10)
    ]
    return {"meta": {}, "nodes": nodes, "events": [], "quiz": quiz}


class ValidatorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        open(os.path.join(self.tmp.name, "img.svg"), "w").close()
        self.nodes = [
            make_node("vie", None, 3700),
            make_node("poissons", "vie", 500),
            make_node("requins", "poissons", 440),
        ]

    def tearDown(self):
        self.tmp.cleanup()

    def errors(self, nodes):
        report = TreeReport(make_data(nodes), self.tmp.name)
        report.run()
        return report.errors

    def test_valid_tree(self):
        self.assertEqual(self.errors(self.nodes), [])

    def test_child_older_than_parent(self):
        self.nodes[2]["appeared_mya"] = 600
        errors = self.errors(self.nodes)
        self.assertEqual(len(errors), 1)
        self.assertIn("vie › poissons › requins", errors[0])
        self.assertIn("600 Ma", errors[0])
        self.assertIn("500 Ma", errors[0])

    def test_duplicate_id(self):
        self.nodes.append(make_node("requins", "vie", 400))
        self.assertTrue(any("en double" in e for e in self.errors(self.nodes)))

    def test_missing_parent(self):
        self.nodes[2]["parent_id"] = "inconnu"
        self.assertTrue(any("n'existe pas" in e for e in self.errors(self.nodes)))

    def test_two_roots(self):
        self.nodes[1]["parent_id"] = None
        self.assertTrue(any("une racine" in e for e in self.errors(self.nodes)))

    def test_cycle(self):
        self.nodes[1]["parent_id"] = "requins"
        self.assertTrue(any("Cycle" in e for e in self.errors(self.nodes)))

    def test_bad_category_and_type(self):
        self.nodes[1]["category"] = "licorne"
        self.nodes[2]["appeared_mya"] = "440"
        errors = self.errors(self.nodes)
        self.assertTrue(any("non permise" in e for e in errors))
        self.assertTrue(any("appeared_mya" in e and "nombre" in e for e in errors))

    def test_missing_field(self):
        del self.nodes[1]["fun_fact"]
        self.assertTrue(any("fun_fact" in e for e in self.errors(self.nodes)))

    def test_missing_image_and_empty_license(self):
        self.nodes[1]["image"] = "absent.webp"
        self.nodes[2]["image_license"] = " "
        errors = self.errors(self.nodes)
        self.assertTrue(any("introuvable" in e for e in errors))
        self.assertTrue(any("image_license" in e for e in errors))

    def test_extinct_before_appearing(self):
        self.nodes[2]["extinct_mya"] = 450
        self.assertTrue(any("avant d'apparaître" in e for e in self.errors(self.nodes)))

    def test_exit_code(self):
        bad = copy.deepcopy(self.nodes)
        bad[2]["appeared_mya"] = 9999
        data_dir = os.path.join(self.tmp.name, "data")
        os.makedirs(data_dir)
        path = os.path.join(data_dir, "evolution_tree.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(make_data(bad), handle)
        script = os.path.join(ROOT, "scripts", "validate.py")
        result = subprocess.run([sys.executable, script, path], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apparaît avant son ancêtre", result.stdout)


@unittest.skipUnless(os.path.isfile(REAL_DATA), "data/evolution_tree.json absent")
class RealDataTest(unittest.TestCase):
    def test_real_data_is_valid(self):
        with open(REAL_DATA, encoding="utf-8") as handle:
            report = TreeReport(json.load(handle), ROOT)
        report.run()
        self.assertEqual(report.errors, [])


if __name__ == "__main__":
    unittest.main()
