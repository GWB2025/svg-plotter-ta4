"""Gordon's physical pen inventory; references are recorded as supplied."""
import copy
import json
from pathlib import Path


class PenCollection:
    """Resolve stable pen identifiers independently of drawing colours."""

    def __init__(self, items=None):
        self.items = copy.deepcopy(items) if items is not None else json.loads(
            (Path(__file__).parent / 'assets' / 'pens.json').read_text())
        self.by_id = {pen['id']: pen for pen in self.items}

    def get(self, pen_id):
        try:
            return self.by_id[pen_id]
        except KeyError as exc:
            raise ValueError('Unknown pen: ' + pen_id) from exc

    def label(self, pen_id):
        pen = self.get(pen_id)
        reference = f" — {pen['reference']}" if pen.get('reference') else ''
        ink = f" · Ink: {pen['ink_name']}" if pen.get('ink_name') else ''
        return f"{pen.get('brand', 'Pigma Micron')} {pen['colour']} {pen['size']}{reference}{ink}"
