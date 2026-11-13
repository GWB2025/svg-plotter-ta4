"""Render the supplied materials comparison without changing personal stock."""

from html import escape
import json


class MaterialsGuide:
    """Bundle an offline reference with searchable material notes."""

    FIELDS = (
        ('material', 'Material / nib type'),
        ('compatibility', 'Paper / pen pairing'),
        ('lightfastness', 'Lightfastness / fade resistance (as reported)'),
        ('notes', 'Notes from the comparison'),
    )

    def __init__(self, path):
        self.data = json.loads(path.read_text(encoding='utf-8'))
        self.entries = self.data['entries']

    def card(self, entry):
        details = ''.join(
            f'<dt>{label}</dt><dd>{escape(entry[key])}</dd>'
            for key, label in self.FIELDS
        )
        return (
            '<article class="material-card" '
            f'data-category="{escape(entry["category"], quote=True)}">'
            f'<p class="material-category">{escape(entry["category"])}</p>'
            f'<h3>{escape(entry["name"])}</h3><dl>{details}</dl>'
            '</article>'
        )

    def render(self):
        categories = dict.fromkeys(entry['category'] for entry in self.entries)
        options = ''.join(
            f'<option value="{escape(category, quote=True)}">'
            f'{escape(category)}</option>' for category in categories
        )
        cards = ''.join(self.card(entry) for entry in self.entries)
        return f'''<section id="materials-panel" role="tabpanel"
            aria-labelledby="materials-tab" hidden>
          <p class="eyebrow">Materials reference</p>
          <h2>Pens, inks and papers</h2>
          <p>Browse the supplied <em>{escape(self.data['title'])}</em>.</p>
          <div class="materials-credit">
            <p>These are reference notes, not T-A4 compatibility tests. Try a small sample
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
          <p class="subtle">The comparison is available offline. Your personal pens are managed in
            Pen stock.</p>
        </section>'''
