"""Capture and composition preserve character identity and vertical metrics."""

import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from app import create_app
from test_app import sample


class CharacterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.client = create_app(self.folder).test_client()

    def test_every_advertised_character_can_be_saved_and_composed(self):
        response = self.client.get('/api/characters')
        self.assertEqual(response.status_code, 200)
        groups = response.json['groups']
        characters = ''.join(group['characters'] for group in groups)
        self.assertTrue(set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?£') <= set(characters))
        for character in characters:
            with self.subTest(character=character):
                self.assertEqual(self.client.post('/api/samples', json=sample(character)).status_code, 201)
        response = self.client.post('/api/compose', json={'text': characters})
        self.assertEqual(response.status_code, 200)
        root = ET.fromstring(response.data)
        self.assertEqual(len(list(root.iter('{http://www.w3.org/2000/svg}path'))), 2 * len(characters))

    def test_descender_and_apostrophe_keep_their_position(self):
        for character, values in [('g', (120, 280)), ("'", (90, 110)), ('Q', (60, 245))]:
            with self.subTest(character=character):
                payload = sample(character)
                payload['strokes'] = payload['strokes'][:1]
                for point, y in zip(payload['strokes'][0]['points'], values):
                    point['y'] = y
                saved = self.client.post('/api/samples', json=payload)
                self.assertEqual(saved.status_code, 201)
                source = self.folder / 'raw' / (saved.json['id'] + '.json')
                original = source.read_bytes()
                response = self.client.post('/api/compose', json={'text': character})
                self.assertEqual(response.status_code, 200)
                path = next(ET.fromstring(response.data).iter('{http://www.w3.org/2000/svg}path'))
                self.assertEqual(path.attrib['d'], f'M 10.0000 {10 + values[0] / 10:.4f} L 15.0000 {10 + values[1] / 10:.4f}')
                self.assertEqual(source.read_bytes(), original)

    def test_missing_characters_are_reported_without_case_folding(self):
        self.client.post('/api/samples', json=sample('a'))
        response = self.client.post('/api/compose', json={'text': 'Aa'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('A', response.json['error'])

    def test_scaled_descender_is_anchored_at_the_capture_baseline(self):
        payload = sample('g')
        payload['strokes'] = payload['strokes'][:1]
        payload['strokes'][0]['points'][1]['y'] = 280
        saved = self.client.post('/api/samples', json=payload)
        self.assertEqual(saved.status_code, 201)
        self.client.post('/api/review', json={saved.json['id']: {'enabled': True, 'scale': .5, 'shift': 10}})
        response = self.client.post('/api/compose', json={'text': 'g'})
        path = next(ET.fromstring(response.data).iter('{http://www.w3.org/2000/svg}path'))
        self.assertEqual(path.attrib['d'], 'M 10.0000 28.0000 L 12.5000 36.0000')

    def test_unsupported_character_never_writes_a_sample(self):
        for character in ('ab', ' ', '\n', '<', '😀'):
            self.assertEqual(self.client.post('/api/samples', json=sample(character)).status_code, 400)
        self.assertFalse(list((self.folder / 'raw').glob('*.json')))
