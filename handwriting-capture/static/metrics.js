(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandwritingMetrics = api;
})(globalThis, function() {
  'use strict';
  function anchor(record, definition) {
    if (definition.guide_aligned.includes(record.character)) {
      return record.coordinates?.baseline ?? definition.baseline;
    }
    return record.strokes.reduce((bottom, stroke) =>
      stroke.points.reduce((value, point) => Math.max(value, point.y), bottom), -Infinity);
  }
  function y(value, record, config, definition) {
    return definition.baseline + (value - anchor(record, definition)) * config.scale + config.shift;
  }
  function next(character, group) {
    return group.characters[group.characters.indexOf(character) + 1] ?? null;
  }
  return {anchor, y, next};
});
