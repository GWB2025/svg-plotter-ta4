'use strict';
(function (root) {
  const fail = message => { throw Error(message); };
  function placePaths(paths, options = {}) {
    if (!paths.length || !paths.some(p => p.length > 1)) fail('The SVG has no drawing paths.');
    const points = paths.flat();
    if (points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) fail('Invalid SVG coordinate.');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    if (options.mode === 'actual') {
      if (minX < 0 || minY < 0 || maxX > 210 || maxY > 297) fail('Drawing extends beyond A4. Choose Fit to page.');
      return paths;
    }
    const margin = Number(options.margin ?? 20);
    if (!Number.isFinite(margin) || margin < 0 || margin > 90) fail('Choose a margin between 0 and 90 mm.');
    const w = maxX - minX, h = maxY - minY;
    if (!w && !h) fail('The SVG has no drawing length.');
    const scale = Math.min(w ? (210 - 2 * margin) / w : Infinity, h ? (297 - 2 * margin) / h : Infinity);
    return paths.map(p => p.map(([x, y]) => [(x - minX) * scale + (210 - w * scale) / 2, (y - minY) * scale + (297 - h * scale) / 2]));
  }
  function makeGcode(paths) {
    placePaths(paths, {mode: 'actual'});
    const lines = ['G21', 'G90 G1 Z0.5 F1200'];
    const move = ([x, y], feed) => `G90 G1 X${x.toFixed(4)} Y${(-y).toFixed(4)} F${feed}`;
    for (const path of paths) {
      if (path.length < 2) continue;
      lines.push(move(path[0], 2400), 'G90 G1 Z5 F3000');
      for (const point of path.slice(1)) lines.push(move(point, 900));
      lines.push('G90 G1 Z0.5 F3000');
    }
    lines.push('G90 G1 X0 Y0 F2400');
    return lines.join('\n') + '\n';
  }
  function makeColourGcode(paths, colours, pens = {}) {
    if (!colours || colours.length !== paths.length) fail('Missing SVG path colours.');
    const groups = new Map();
    paths.forEach((path, i) => {
      const colour = colours[i];
      if (!/^#[0-9a-f]{6}$/i.test(colour)) fail('Unsupported pen colour.');
      const key = colour.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(path);
    });
    const lines = ['G21', 'G90 G1 Z0.5 F1200'];
    for (const [colour, group] of groups) {
      const pen = pens[colour] || '';
      if (pen && !/^[a-z0-9-]{1,60}$/.test(pen)) fail('Invalid pen identifier.');
      lines.push('; PEN_CHANGE ' + colour + (pen ? ' ' + pen : ''));
      for (const command of makeGcode(group).trim().split('\n').slice(2)) lines.push(command);
    }
    return lines.join('\n') + '\n';
  }
  function colourHex(value) {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    const m = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    if (!m) fail('Unsupported SVG pen colour: ' + value);
    return '#' + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  }
  function lengthMm(value, fallback) {
    if (!value) return fallback;
    const m = String(value).trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+))(mm|cm|in|pt|pc|px)?$/);
    if (!m) fail('SVG page dimensions must use mm, cm, inches, points or pixels.');
    const n = Number(m[1]) * ({mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96}[m[2] || 'px']);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) fail('Invalid SVG page size.');
    return n;
  }
  function extractPaths(text) {
    if (text.length > 8 * 1024 * 1024) fail('Choose an SVG smaller than 8 MB.');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('SVG document declarations are not supported.');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') fail('This is not a valid SVG file.');
    const source = doc.documentElement;
    const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title', 'desc', 'defs', 'metadata']);
    for (const node of [source, ...source.querySelectorAll('*')]) {
      if (node.closest('metadata')) continue;
      if (node.namespaceURI !== 'http://www.w3.org/2000/svg') continue;
      if (!allowed.has(node.localName)) fail(`SVG element <${node.localName}> is not supported. Convert text and clones to paths; remove images, masks and effects first.`);
      if (node !== source && node.localName === 'svg') fail('Nested SVG viewports are not supported. Flatten the drawing first.');
      for (const a of [...node.attributes]) {
        if ((a.name === 'style' && /transform\s*:/i.test(a.value)) || /^on/i.test(a.name) || /href$/i.test(a.name) || /url\s*\(/i.test(a.value) || /(?:clip-path|mask|filter|marker)/i.test(a.name + ':' + a.value)) fail('SVG references, clipping and effects must be converted to plain paths first.');
      }
    }
    const vb = source.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (vb && (vb.length !== 4 || vb.some(n => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0)) fail('Invalid SVG viewBox.');
    const width = lengthMm(source.getAttribute('width'), vb ? vb[2] * 25.4 / 96 : 210);
    const height = lengthMm(source.getAttribute('height'), vb ? vb[3] * 25.4 / 96 : 297);
    const svg = document.importNode(source, true);
    svg.querySelectorAll('metadata,defs').forEach(n => n.remove());
    svg.querySelectorAll('*').forEach(n => { if (n.namespaceURI !== 'http://www.w3.org/2000/svg') n.remove(); });
    svg.style.width = width + 'px'; svg.style.height = height + 'px';
    svg.setAttribute('width', width); svg.setAttribute('height', height);
    if (!vb) svg.setAttribute('viewBox', `0 0 ${width * 96 / 25.4} ${height * 96 / 25.4}`);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none';
    holder.append(svg); document.body.append(holder);
    let count = 0;
    const result = [];
    result.colours = [];
    let activeColour = '#000000';
    function sample(shape, matrix) {
      const total = shape.getTotalLength();
      const scale = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
      if (!Number.isFinite(total * scale)) fail('Invalid SVG geometry.');
      if (!total) return;
      const steps = Math.max(1, Math.ceil(total * scale / 0.2));
      count += steps + 1;
      if (count > 250000) fail('Drawing is too complex. Simplify its paths before loading.');
      const path = [];
      for (let i = 0; i <= steps; i++) {
        const p = shape.getPointAtLength(total * i / steps);
        path.push([matrix.a * p.x + matrix.c * p.y + matrix.e, matrix.b * p.x + matrix.d * p.y + matrix.f]);
      }
      result.push(path);
      result.colours.push(activeColour);
    }
    try {
      for (const shape of svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')) {
        let hidden = false;
        for (let n = shape; n && n !== holder; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) hidden = true;
        }
        if (hidden) continue;
        const paint = getComputedStyle(shape);
        activeColour = colourHex(paint.stroke !== 'none' ? paint.stroke : paint.fill !== 'none' ? paint.fill : 'rgb(0, 0, 0)');
        const matrix = shape.getCTM();
        if (!matrix) fail('Could not read SVG transforms.');
        if (shape.localName !== 'path') { sample(shape, matrix); continue; }
        const data = shape.getAttribute('d') || '';
        const parts = data.match(/[Mm][^Mm]*/g) || [];
        let end = {x: 0, y: 0};
        const temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.append(temp);
        for (let part of parts) {
          if (part[0] === 'm') {
            const m = part.match(/^m\s*([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)\s*,?\s*([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)/i);
            if (!m) fail('Invalid relative SVG path.');
            part = `M${end.x + Number(m[1])},${end.y + Number(m[2])}l` + part.slice(m[0].length);
            // Further coordinate pairs after relative moveto are relative lines.
            part = part.replace(/l\s*(?=[A-Za-z]|$)/, '');
          }
          temp.setAttribute('d', part);
          sample(temp, matrix);
          end = temp.getPointAtLength(temp.getTotalLength());
        }
        temp.remove();
      }
    } finally { holder.remove(); }
    if (!result.length) fail('The SVG has no visible drawing paths.');
    return result;
  }
  const examples = [{"name": "small-star.svg", "title": "Small star \u00b7 57 \u00d7 54 mm", "description": "A short first drawing with one continuous outline.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<polygon points=\"105.0000,118.5000 112.0534,138.7918 133.5317,139.2295 116.4127,152.2082 122.6336,172.7705 105.0000,160.5000 87.3664,172.7705 93.5873,152.2082 76.4683,139.2295 97.9466,138.7918\"/>\n</g>\n</svg>\n"}, {"name": "geometry-check.svg", "title": "Geometry check \u00b7 100 \u00d7 100 mm", "description": "A square, circle, triangle and centre cross for checking shapes and pen lifts.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect x=\"55\" y=\"98.5\" width=\"100\" height=\"100\"/>\n<circle cx=\"105\" cy=\"148.5\" r=\"40\"/>\n<path d=\"M105 108.5 L70 173.5 L140 173.5 Z\"/>\n<path d=\"M100 148.5 H110 M105 143.5 V153.5\"/>\n</g>\n</svg>\n"}, {"name": "curves-and-strokes.svg", "title": "Curves and separate strokes \u00b7 140 \u00d7 80 mm", "description": "Wave curves, arcs and separate marks; the gaps should stay unmarked.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M35 118.5 C55 78.5 85 158.5 105 118.5 S155 78.5 175 118.5\"/>\n<path d=\"M35 158.5 Q70 108.5 105 158.5 T175 158.5\"/>\n<path d=\"M65 178.5 A20 20 0 0 1 105 178.5 M125 178.5 A20 20 0 0 1 165 178.5\"/>\n<path d=\"m45 178.5 0 10 m10 -10 0 10\"/>\n</g>\n</svg>\n"}, {"name": "square-grid.svg", "title": "Square grid \u00b7 100 \u00d7 100 mm", "description": "Sixteen 16 mm squares, inspired by Dan\u2019s grid examples.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect x=\"55\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"182.5\" width=\"16\" height=\"16\"/>\n</g>\n</svg>\n"}, {"name": "colour-shapes.svg", "title": "Coloured shapes \u00b7 red, blue, green and purple", "description": "Red square, blue circle, green triangle and purple wave. Returns to the top-left and waits for a pen change between colours.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<title>Four coloured shapes</title>\n<desc>A red square, blue circle, green triangle and purple wave. Plot each colour with its matching pen, returning to the top-left between colours.</desc>\n<g fill=\"none\" stroke-width=\"0.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect stroke=\"#d32f2f\" x=\"50\" y=\"93.5\" width=\"45\" height=\"45\"/>\n<circle stroke=\"#1565c0\" cx=\"137.5\" cy=\"116\" r=\"22.5\"/>\n<path stroke=\"#2e7d32\" d=\"M72.5 158.5 L50 203.5 L95 203.5 Z\"/>\n<path stroke=\"#7b1fa2\" d=\"M115 181 C125 151 150 211 160 181\"/>\n</g>\n</svg>\n"}];
  const api = {placePaths, makeGcode, makeColourGcode, colourHex, extractPaths, lengthMm, examples};
  if (typeof module !== 'undefined') module.exports = api;
  root.SVGImport = api;
})(typeof window === 'undefined' ? globalThis : window);
