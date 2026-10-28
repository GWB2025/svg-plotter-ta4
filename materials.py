"""Render the supplied materials comparison without changing personal stock."""

from html import escape
import json


class MaterialsGuide:
    """Bundle an offline reference with explicit provenance and video links."""

    VIDEO_URL = 'https://www.youtube.com/watch?v=8bsWp6pKeYk'
    COURSE_URL = 'https://penplotter.com/'
    FIELDS = (
        ('material', 'Material / nib type'),
        ('compatibility', 'Paper / pen pairing'),
        ('lightfastness', 'Lightfastness / fade resistance (as reported)'),
        ('notes', 'Notes from the comparison'),
    )

    def __init__(self, path):
        self.data = json.loads(path.read_text(encoding='utf-8'))
        self.entries = self.data['entries']

    @staticmethod
    def link(url, title):
        """Escape link text and attributes, including document-supplied text."""
        return (f'<a href="{escape(url, quote=True)}" target="_blank" '
                f'rel="noopener noreferrer">{escape(title)}</a>')

    def card(self, entry):
        minutes, seconds = map(int, entry['timestamp'].split(':'))
        video = self.link(
            f'{self.VIDEO_URL}&t={minutes * 60 + seconds}s',
            f"Video at {entry['timestamp']}",
        )
        details = ''.join(
            f'<dt>{label}</dt><dd>{escape(entry[key])}</dd>'
            for key, label in self.FIELDS
        )
        return (
            '<article class="material-card" '
            f'data-category="{escape(entry["category"], quote=True)}">'
            f'<p class="material-category">{escape(entry["category"])}</p>'
            f'<h3>{escape(entry["name"])}</h3><dl>{details}</dl>'
            f'<p class="material-source">Source {escape(entry["source"])}'
            f' · {video}</p></article>'
        )

    def render(self):
        categories = dict.fromkeys(entry['category'] for entry in self.entries)
        options = ''.join(
            f'<option value="{escape(category, quote=True)}">'
            f'{escape(category)}</option>' for category in categories
        )
        cards = ''.join(self.card(entry) for entry in self.entries)
        source = self.link(self.VIDEO_URL, self.data['source_title'])
        course = self.link(self.COURSE_URL, 'Dan’s course and resources')
        return f'''<section id="materials-panel" role="tabpanel"
            aria-labelledby="materials-tab" hidden>
          <p class="eyebrow">Drawing Machines 101 · Reference</p>
          <h2>Pens, inks and papers</h2>
          <p>Browse the supplied <em>{escape(self.data['title'])}</em>.</p>
          <div class="materials-credit">
            <p><strong>With thanks to Dan Catt</strong> for sharing his
            pen-plotting experience in {source} (source 1). {course}.</p>
            <p>Comparison supplied by Gordon Brindle, 27 October 2026.
            Wording and timestamps are retained from that document. These are
            reference notes, not T-A4 compatibility tests. Try a small sample
            with your own pen and paper before committing to a drawing.</p>
          </div>
          <div class="catalogue-toolbar materials-toolbar">
            <label>Search the guide <input type="search" id="materials-search"
              placeholder="Pen, paper, nib or ink property"></label>
            <label>Category <select id="materials-category">
              <option value="">All materials</option>{options}</select></label>
            <button type="button" id="materials-clear">Clear filters</button>
          </div>
          <p id="materials-count" role="status" aria-live="polite">
            {len(self.entries)} of {len(self.entries)} materials shown</p>
          <p id="materials-empty" hidden>No matching materials.
            Try another search or clear the filters.</p>
          <div class="materials-grid">{cards}</div>
          <p class="subtle">The comparison is available offline. Video links
            need an internet connection. Your personal pens are managed in
            Pen stock.</p>
        </section>'''
