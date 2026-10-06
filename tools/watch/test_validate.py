"""validate.py の試験（過去の正しいデータで通り，壊したデータで落ちること）

    python3 -m unittest discover -s tools/watch -p 'test_*.py'
"""
import copy
import json
import os
import unittest

import validate

REG = os.path.join(validate.DATA, "regular")


def load(name):
    with open(os.path.join(REG, name), encoding="utf-8") as f:
        return json.load(f)


class PastData(unittest.TestCase):
    def test_all_existing_files_pass(self):
        with open(os.path.join(validate.DATA, "manifest.json"), encoding="utf-8") as f:
            manifest = json.load(f)
        for n in sorted(os.listdir(REG)):
            if n.endswith(".json"):
                self.assertEqual(validate.check_file(os.path.join(REG, n), manifest), [], n)

    def test_manifest_has_no_errors(self):
        with open(os.path.join(validate.DATA, "manifest.json"), encoding="utf-8") as f:
            errs, _ = validate.check_manifest(json.load(f))
        self.assertEqual(errs, [])


class Broken(unittest.TestCase):
    def setUp(self):
        self.doc = load("ishikawa_line_2026-04-01_null.json")
        self.prev = copy.deepcopy(self.doc)

    def fails(self, key):
        errs = validate.check_doc(self.doc, self.prev)
        self.assertTrue(any(key in e for e in errs), (key, errs))

    def test_baseline_passes(self):
        self.assertEqual(validate.check_doc(self.doc, self.prev), [])

    def test_trip_length_mismatch(self):
        self.doc["routes"][0]["schedules"]["weekday"][3].pop()
        self.fails("停留所の数")

    def test_time_not_monotonic(self):
        t = self.doc["routes"][0]["schedules"]["weekday"][2]
        t[1], t[2] = "9:59", "5:01"
        self.fails("単調増加")

    def test_bad_time_format(self):
        self.doc["routes"][0]["schedules"]["weekday"][0][0] = "5-45"
        self.fails("書式")

    def test_trip_count_halved(self):
        sch = self.doc["routes"][0]["schedules"]
        sch["weekday"] = sch["weekday"][:10]
        self.fails("極端")

    def test_stops_reordered(self):
        self.doc["routes"][0]["stops"].reverse()
        self.fails("停留所の並び")

    def test_route_missing(self):
        self.doc["routes"].pop()
        self.fails("路線の組")

    def test_empty_routes(self):
        self.doc["routes"] = []
        self.fails("routes が空")

    def test_bad_dates(self):
        self.doc["meta"]["valid_from"] = "2026/04/01"
        self.fails("valid_from")
        self.doc["meta"].update(valid_from="2026-04-01", valid_until="2026-03-01")
        self.fails("逆転")

    def test_manifest_overlap_and_missing_file(self):
        m = {"regular": {"x": [{"file": "a.json", "valid_from": "2026-01-01", "valid_until": "2026-06-30"},
                               {"file": "b.json", "valid_from": "2026-06-01", "valid_until": None}]}}
        errs, _ = validate.check_manifest(m)
        self.assertTrue(any("重なる" in e for e in errs))
        self.assertTrue(any("存在しない" in e for e in errs))


if __name__ == "__main__":
    unittest.main()
