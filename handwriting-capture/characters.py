"""Shared character catalogue and baseline-aware handwriting geometry."""

import copy
import json
from pathlib import Path


class CharacterSet:
    """Keep capture choices and layout metrics in one shared catalogue."""

    def __init__(self):
        source = Path(__file__).parent / 'static' / 'characters.json'
        self.definition = json.loads(source.read_text())
        self.characters = ''.join(
            group['characters'] for group in self.definition['groups']
        )
        self.baseline = self.definition['baseline']
        self.guide_aligned = set(self.definition['guide_aligned'])

    def contains(self, character):
        return (
            isinstance(character, str)
            and len(character) == 1
            and character in self.characters
        )

    def adjusted(self, record, scale=1, shift=0):
        """Copy a sample and scale about its baseline without flattening tails."""
        result = copy.deepcopy(record)
        if record['character'] in self.guide_aligned:
            anchor = record.get('coordinates', {}).get(
                'baseline', self.baseline
            )
        else:
            anchor = max(
                point['y']
                for stroke in record['strokes']
                for point in stroke['points']
            )
        for stroke in result['strokes']:
            for point in stroke['points']:
                point['x'] *= scale
                point['y'] = (
                    self.baseline + (point['y'] - anchor) * scale + shift
                )
        return result
