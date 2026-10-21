"""Gordon's physical pen inventory; references are recorded as supplied."""
import json
from pathlib import Path


class PenCollection:
    """Resolve stable pen identifiers independently of drawing colours."""

    def __init__(self):
        self.items = json.loads(
            (Path(__file__).parent / 'assets' / 'pens.json').read_text())
        self.by_id = {pen['id']: pen for pen in self.items}

    def get(self, pen_id):
        try:
            return self.by_id[pen_id]
        except KeyError as exc:
            raise ValueError('Unknown pen: ' + pen_id) from exc

    def label(self, pen_id):
        pen = self.get(pen_id)
        return (f"Pigma Micron {pen['colour']} {pen['size']}"
                f" — {pen['reference']}")
