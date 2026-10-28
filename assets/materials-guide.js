'use strict';
(function() {
  const $ = id => document.getElementById(id);
  const search = $('materials-search'), category = $('materials-category');
  const cards = [...document.querySelectorAll('#materials-panel .material-card')];
  const index = cards.map(card => ({card, text: card.textContent.toLocaleLowerCase()}));
  function filter() {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const {card, text} of index) {
      card.hidden = !!(category.value && card.dataset.category !== category.value) ||
        !words.every(word => text.includes(word));
      if (!card.hidden) count++;
    }
    $('materials-count').textContent = count + ' of ' + cards.length + ' materials shown';
    $('materials-empty').hidden = count !== 0;
  }
  search.oninput = filter;
  category.onchange = filter;
  $('materials-clear').onclick = () => { search.value = ''; category.value = ''; filter(); };
  filter();
})();
