'use strict';
(function (root) {
  const fail = message => { throw Error(message); };
  const transformPoint = ([a, b, c, d, e, f], [x, y]) => [a*x + c*y + e, b*x + d*y + f];
  // One affine transform drives both vector placement and layered rasterisation.
  // Exact quarter-turn matrices avoid trigonometric drift at the bed edges.
  function placementTransform(paths, options = {}) {
    if (!paths.length || !paths.some(p => p.length > 1)) fail('The SVG has no drawing paths.');
    const bed = options.profile || {width:210,height:297};
    const width = Number(options.width ?? bed.width), height = Number(options.height ?? bed.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > bed.width || height > bed.height) fail(`Page must fit the ${bed.width} × ${bed.height} mm plotter bed.`);
    const points = paths.flat();
    if (points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) fail('Invalid SVG coordinate.');
    const rotation = Number(options.rotation ?? 0);
    if (!Number.isFinite(rotation) || rotation % 90 !== 0) fail('SVG rotation must be a multiple of 90 degrees.');
    const turn = ((rotation / 90) % 4 + 4) % 4;
    let matrix = [1, 0, 0, 1, 0, 0];
    if (turn) {
      const w = paths.width, h = paths.height;
      if (![w, h].every(n => Number.isFinite(n) && n > 0)) fail('SVG page dimensions are required for rotation.');
      matrix = [matrix, [0, 1, -1, 0, h, 0], [-1, 0, 0, -1, w, h], [0, -1, 1, 0, 0, w]][turn];
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of points) {
      const [x, y] = transformPoint(matrix, point);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (options.mode === 'actual') {
      // Allow only arithmetic round-off, far below the 0.0001 mm G-code precision.
      const epsilon = 1e-9;
      if (minX < -epsilon || minY < -epsilon || maxX > width + epsilon || maxY > height + epsilon) fail('Drawing extends beyond the selected page (A4 by default). Rotate landscape artwork by 90° or choose Fit to page.');
      return matrix;
    }
    const margin = Number(options.margin ?? 20);
    if (!Number.isFinite(margin) || margin < 0 || 2 * margin >= Math.min(width, height)) fail('Margin must be non-negative and less than half the shorter page dimension.');
    const w = maxX - minX, h = maxY - minY;
    if (!w && !h) fail('The SVG has no drawing length.');
    const scale = Math.min(w ? (width - 2 * margin) / w : Infinity, h ? (height - 2 * margin) / h : Infinity);
    const [a, b, c, d, e, f] = matrix;
    return [a*scale, b*scale, c*scale, d*scale,
      (e-minX)*scale + (width-w*scale)/2, (f-minY)*scale + (height-h*scale)/2];
  }
  function placePaths(paths, options = {}) {
    const matrix = placementTransform(paths, options);
    if (options.mode === 'actual' && Number(options.rotation ?? 0) % 360 === 0) return paths;
    return paths.map(path => path.map(point => transformPoint(matrix, point)));
  }
  const defaultMachine = {width:210,height:297,x_direction:1,y_direction:-1,pen_up:.5,pen_down:5,draw_feed:900,travel_feed:2400,lift_feed:1200,stroke_feed:3000};
  function machineHeader(profile) {
    return [...(profile.fingerprint ? ['; PLOTTER_PROFILE '+profile.fingerprint] : []), 'G21', `G90 G1 Z${profile.pen_up} F${profile.lift_feed}`];
  }
  function makeGcode(paths, options = {}) {
    const profile = options.profile || defaultMachine;
    placementTransform(paths, {...options, mode:'actual', rotation:0});
    const lines = machineHeader(profile);
    const move = ([x, y], feed) => `G90 G1 X${(x*profile.x_direction).toFixed(4)} Y${(y*profile.y_direction).toFixed(4)} F${feed}`;
    for (const path of paths) {
      if (path.length < 2) continue;
      lines.push(move(path[0], profile.travel_feed), `G90 G1 Z${profile.pen_down} F${profile.stroke_feed}`);
      for (const point of path.slice(1)) lines.push(move(point, profile.draw_feed));
      lines.push(`G90 G1 Z${profile.pen_up} F${profile.stroke_feed}`);
    }
    lines.push(`G90 G1 X0 Y0 F${profile.travel_feed}`);
    return lines.join('\n') + '\n';
  }
  function makeColourGcode(paths, colours, pens = {}, options = {}) {
    if (!colours || colours.length !== paths.length) fail('Missing SVG path colours.');
    const groups = new Map();
    paths.forEach((path, i) => {
      const colour = colours[i];
      if (!/^#[0-9a-f]{6}$/i.test(colour)) fail('Unsupported pen colour.');
      const key = colour.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(path);
    });
    const profile = options.profile || defaultMachine;
    const lines = machineHeader(profile);
    for (const [colour, group] of groups) {
      const pen = pens[colour] || '';
      if (pen && !/^[a-z0-9-]{1,60}$/.test(pen)) fail('Invalid pen identifier.');
      lines.push('; PEN_CHANGE ' + colour + (pen ? ' ' + pen : ''));
      for (const command of makeGcode(group, options).trim().split('\n').slice(machineHeader(profile).length)) lines.push(command);
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
    result.paintColours = [];
    result.width = width; result.height = height;
    result.positioningGuide = source.getAttribute('data-plotter-guide') === 'stock-v1';
    result.postcardText = source.getAttribute('data-plotter-postcard') === 'text-v1';
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
        if (paint.stroke === 'none' && paint.fill === 'none') continue;
        for (let n = shape; n && n !== holder; n = n.parentElement) {
          const style = getComputedStyle(n);
          if (Number(style.opacity) !== 1 || style.mixBlendMode !== 'normal') result.layeredUnsupported = true;
        }
        for (const key of ['fill', 'stroke']) {
          const value = paint[key];
          if (value === 'none') continue;
          if (Number(paint[key + 'Opacity']) !== 1 || value.startsWith('rgba(')) result.layeredUnsupported = true;
          const colour = colourHex(value);
          if (!result.paintColours.includes(colour)) result.paintColours.push(colour);
        }
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
      result.paintSvg = new XMLSerializer().serializeToString(svg);
    } finally { holder.remove(); }
    if (!result.length) fail('The SVG has no visible drawing paths.');
    return result;
  }
  // Composite first, then hatch only the visible colour. White still hides
  // lower artwork even when it is supplied by bare paper rather than a pen.
  function rgbaToHatches(image, colours, options = {}) {
    const spacing = Number(options.spacing ?? 0.5), ppm = options.pixelsPerMm ?? 10;
    if (!Number.isFinite(spacing) || spacing < 0.2 || spacing > 3) fail('Choose hatch spacing between 0.2 and 3 mm.');
    const palette = colours.map(hex => ({hex, rgb: hex.slice(1).match(/../g).map(n => parseInt(n, 16))}));
    if (palette.length > 64) fail('Layered drawings support at most 64 colours. Simplify the palette first.');
    const result = []; result.colours = [];
    const {data, width, height} = image;
    const cache = new Map();
    function colourAt(x, y) {
      const i = 4 * (y * width + x);
      const r = data[i], g = data[i+1], b = data[i+2];
      if (!data[i+3]) return null;
      const key = r * 65536 + g * 256 + b;
      if (cache.has(key)) return cache.get(key);
      let best = (255-r)**2 + (255-g)**2 + (255-b)**2 + 1, chosen = null;
      for (const entry of palette) {
        const distance = entry.rgb.reduce((sum, value, k) => sum + (value - [r,g,b][k])**2, 0);
        if (distance < best) { best = distance; chosen = entry; }
      }
      const colour = chosen && !(options.leaveWhite !== false && chosen.rgb.every(n => n >= 235)) ? chosen.hex : null;
      cache.set(key, colour); return colour;
    }
    for (let row = 0, y = spacing / 2; y < height / ppm; row++, y = spacing / 2 + row * spacing) {
      const py = Math.min(height - 1, Math.floor(y * ppm));
      let start = 0, colour = colourAt(0, py);
      for (let x = 1; x <= width; x++) {
        const next = x === width ? null : colourAt(x, py);
        if (next === colour) continue;
        if (colour) {
          const ends = [[start / ppm, y], [x / ppm, y]];
          result.push(row % 2 ? ends.reverse() : ends); result.colours.push(colour);
          if (result.length > 80000) fail('Too many fill segments. Increase hatch spacing or simplify the artwork.');
        }
        start = x; colour = next;
      }
    }
    return result;
  }
  async function layeredPaths(source, options = {}) {
    if (source.layeredUnsupported) fail('Layered fills currently require opaque colours without blending. Flatten transparency in your SVG editor first.');
    const matrix = placementTransform(source, options);
    if ((options.width ?? 210) * (options.height ?? 297) > 250000) fail('Layered fills support pages up to 250,000 mm². Use a smaller page or outline paths.');
    const canvas = document.createElement('canvas'); canvas.width = Math.round((options.width ?? 210) * 10); canvas.height = Math.round((options.height ?? 297) * 10);
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    // Keep the page transparent: an explicit white shape may be plotted when
    // requested, but the untouched page background must never become a fill.
    const url = URL.createObjectURL(new Blob([source.paintSvg], {type:'image/svg+xml'}));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Could not render layered SVG.')); image.src = url; });
      ctx.setTransform(...matrix.map(value => 10 * value));
      ctx.drawImage(image, 0, 0, source.width, source.height);
      const result = rgbaToHatches(ctx.getImageData(0, 0, canvas.width, canvas.height), source.paintColours, options);
      if (!result.length) fail('No coloured areas remain. Disable bare-paper whites or choose Outline paths.');
      return result;
    } finally { URL.revokeObjectURL(url); }
  }
  const examples = [{"name": "small-star.svg", "title": "Small star \u00b7 57 \u00d7 54 mm", "description": "A short first drawing with one continuous outline.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<polygon points=\"105.0000,118.5000 112.0534,138.7918 133.5317,139.2295 116.4127,152.2082 122.6336,172.7705 105.0000,160.5000 87.3664,172.7705 93.5873,152.2082 76.4683,139.2295 97.9466,138.7918\"/>\n</g>\n</svg>\n"}, {"name": "geometry-check.svg", "title": "Geometry check \u00b7 100 \u00d7 100 mm", "description": "A square, circle, triangle and centre cross for checking shapes and pen lifts.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect x=\"55\" y=\"98.5\" width=\"100\" height=\"100\"/>\n<circle cx=\"105\" cy=\"148.5\" r=\"40\"/>\n<path d=\"M105 108.5 L70 173.5 L140 173.5 Z\"/>\n<path d=\"M100 148.5 H110 M105 143.5 V153.5\"/>\n</g>\n</svg>\n"}, {"name": "curves-and-strokes.svg", "title": "Curves and separate strokes \u00b7 140 \u00d7 80 mm", "description": "Wave curves, arcs and separate marks; the gaps should stay unmarked.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<path d=\"M35 118.5 C55 78.5 85 158.5 105 118.5 S155 78.5 175 118.5\"/>\n<path d=\"M35 158.5 Q70 108.5 105 158.5 T175 158.5\"/>\n<path d=\"M65 178.5 A20 20 0 0 1 105 178.5 M125 178.5 A20 20 0 0 1 165 178.5\"/>\n<path d=\"m45 178.5 0 10 m10 -10 0 10\"/>\n</g>\n</svg>\n"}, {"name": "square-grid.svg", "title": "Square grid \u00b7 100 \u00d7 100 mm", "description": "Sixteen 16 mm squares, inspired by Dan\u2019s grid examples.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<g fill=\"none\" stroke=\"black\" stroke-width=\"0.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect x=\"55\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"98.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"126.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"154.5\" width=\"16\" height=\"16\"/>\n<rect x=\"55\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"83\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"111\" y=\"182.5\" width=\"16\" height=\"16\"/>\n<rect x=\"139\" y=\"182.5\" width=\"16\" height=\"16\"/>\n</g>\n</svg>\n"}, {"name": "colour-shapes.svg", "title": "Coloured shapes \u00b7 red, blue, green and purple", "description": "Red square, blue circle, green triangle and purple wave. Returns to the top-left and waits for a pen change between colours.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<title>Four coloured shapes</title>\n<desc>A red square, blue circle, green triangle and purple wave. Plot each colour with its matching pen, returning to the top-left between colours.</desc>\n<g fill=\"none\" stroke-width=\"0.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n<rect stroke=\"#d32f2f\" x=\"50\" y=\"93.5\" width=\"45\" height=\"45\"/>\n<circle stroke=\"#1565c0\" cx=\"137.5\" cy=\"116\" r=\"22.5\"/>\n<path stroke=\"#2e7d32\" d=\"M72.5 158.5 L50 203.5 L95 203.5 Z\"/>\n<path stroke=\"#7b1fa2\" d=\"M115 181 C125 151 150 211 160 181\"/>\n</g>\n</svg>\n"}, {"name": "layered-fill-check.svg", "title": "Layered fills \u00b7 overlapping colours and bare paper", "description": "Choose Layered colour fills. A white circle hides the red square; a blue square hides both. Only visible colours should be hatched.", "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"297mm\" viewBox=\"0 0 210 297\">\n<title>Layered colour fill check</title>\n<desc>Choose Layered colour fills. The red square is hidden by the white circle and blue square. No red hatching should cross either overlaid shape.</desc>\n<rect x=\"55\" y=\"98.5\" width=\"80\" height=\"80\" fill=\"#d32f2f\"/>\n<circle cx=\"95\" cy=\"138.5\" r=\"23\" fill=\"#ffffff\"/>\n<g transform=\"translate(115 128.5)\"><rect width=\"40\" height=\"50\" fill=\"#1565c0\"/></g>\n</svg>\n"}];
  const api = {placePaths, makeGcode, makeColourGcode, colourHex, extractPaths, lengthMm, examples, rgbaToHatches, layeredPaths};
  if (typeof module !== 'undefined') module.exports = api;
  root.SVGImport = api;
})(typeof window === 'undefined' ? globalThis : window);
