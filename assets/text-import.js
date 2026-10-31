'use strict';
(function(root) {
  const fail = message => { throw Error(message); };
  const MAX_BYTES = 2 * 1024 * 1024;

  function decode(buffer, maxBytes = MAX_BYTES) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if(bytes.byteLength > maxBytes) fail('The text file is too large. Choose a smaller file.');
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
      : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
    try { return new TextDecoder(encoding, {fatal:true}).decode(bytes); }
    catch { fail('Save this text file as UTF-8, or UTF-16 with a byte-order mark, and try again.'); }
  }

  function kind(name, text) {
    if(/\.svg$/i.test(name) || /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'svg';
    if(/\.(gcode|nc)$/i.test(name)) return 'gcode';
    const first = text.replace(/^\ufeff/, '').split(/\r\n?|\n/)
      .map(line => line.split(';', 1)[0].trim()).find(Boolean) || '';
    return /^(?:N\d+\s*)?[GM]\d+(?:\b|[XYZF])/i.test(first) || /^[%$]/.test(first) ? 'gcode' : 'text';
  }

  function setting(value, fallback, name, min, max) {
    const number = value === undefined ? fallback : value;
    if(typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)
      fail(name + ' must be between ' + min + ' and ' + max + '.');
    return number;
  }

  function metrics(font) {
    if(!font?.glyphs || !Number.isFinite(font.cap_height) || font.cap_height<=0
      || !Number.isFinite(font.units) || font.units<=0) fail('The selected font is unavailable.');
    const boxes=Object.values(font.glyphs).map(g=>g.bounds).filter(Boolean);
    const top=Math.max(...boxes.map(b=>b[3])),bottom=Math.min(...boxes.map(b=>b[1]));
    const widest=Math.max(...boxes.map(b=>b[2]-b[0]));
    if(![top,bottom,widest].every(Number.isFinite)||!(top>bottom && widest>0)) fail('The selected font has invalid metrics.');
    return {top,bottom,widest};
  }

  function spacing(font,size) {
    const {top,bottom,widest}=metrics(font);
    const scale=setting(size,12,'Font size (pt)',6,72)*25.4/72/font.units;
    const padded=value=>Math.max(.5,Math.ceil(value*scale/.9*100)/100);
    return {cellWidth:padded(widest),lineHeight:padded(top-bottom)};
  }

  function layout(text, options = {}, font) {
    if(typeof text !== 'string' || text.length > 50000) fail('Text is too long: the limit is 50,000 characters.');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text))
      fail('This file contains control codes. Choose a plain text file.');
    const {top,bottom,widest}=metrics(font);
    const sized=options.size!==undefined;
    const size=sized?setting(options.size,12,'Font size (pt)',6,72):null;
    const automatic=sized?spacing(font,size):{cellWidth:3,lineHeight:5};
    const cellWidth = setting(options.cellWidth, automatic.cellWidth, 'Column spacing (mm)', .5, 40);
    const lineHeight = setting(options.lineHeight, automatic.lineHeight, 'Row spacing (mm)', .5, 60);
    const tabSize = setting(options.tabSize, 8, 'Tab width', 1, 16);
    if(!Number.isInteger(tabSize)) fail('Tab width must be a whole number.');
    const raw = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').normalize('NFC').split('\n');
    if(raw.length > 1000) fail('Text has too many lines: the limit is 1,000.');
    const lines = raw.map(line => {
      let result = '', column = 0;
      for(const character of line) {
        const value = character === '\t' ? ' '.repeat(tabSize - column % tabSize) : character;
        column += [...value].length; result += value;
        if(column > 2000) fail('A line is too long: the limit is 2,000 columns.');
      }
      return result;
    });
    const unknown = [...new Set(lines.join(''))].filter(c => !Object.hasOwn(font.glyphs, c));
    if(unknown.length) fail('The selected font does not contain ' + unknown.slice(0,12)
      .map(c => JSON.stringify(c) + ' (U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0') + ')').join(', ')
      + '. Choose another font or replace these characters before plotting.');
    // Use font-wide metrics, never text-dependent metrics: a space always moves
    // the next glyph by exactly one cell, even in a proportional source font.
    const scale=sized?size*25.4/72/font.units:null;
    if(sized && widest*scale>.9*cellWidth+1e-9)
      fail('Increase column spacing to at least '+automatic.cellWidth+' mm, enable automatic spacing or reduce the font size.');
    if(sized && (top-bottom)*scale>.9*lineHeight+1e-9)
      fail('Increase row spacing to at least '+automatic.lineHeight+' mm, enable automatic spacing or reduce the font size.');
    const sx = sized?scale:.9 * cellWidth / widest, sy = sized?scale:.9 * lineHeight / (top - bottom);
    const inset=sized?(lineHeight-(top-bottom)*scale)/2:.05*lineHeight;
    const paths = [];
    let points = 0;
    lines.forEach((line, row) => {
      [...line].forEach((character, column) => {
        const glyph = font.glyphs[character];
        if(!glyph.bounds) return;
        const centre = (glyph.bounds[0] + glyph.bounds[2]) / 2;
        for(const stroke of glyph.paths) {
          points += stroke.length;
          if(points > 240000) fail('This text is too complex to plot. Use fewer characters.');
          if(stroke.length > 1) paths.push(stroke.map(([x,y]) => [
            (column + .5) * cellWidth + (x - centre) * sx,
            row * lineHeight + inset + (top - y) * sy,
          ]));
        }
      });
    });
    if(!paths.length) fail('Enter some visible text or choose a text file.');
    const columns = Math.max(...lines.map(line => [...line].length)), rows = lines.length;
    return {lines,columns,rows,width:columns*cellWidth,height:rows*lineHeight,
      cellWidth,lineHeight,tabSize,size,paths,colours:paths.map(() => '#000000')};
  }

  function svg(result) {
    if(!result?.paths?.length) fail('Prepare text before exporting.');
    const n = value => String(Number(value.toFixed(4)));
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="'+n(result.width)+'mm" height="'+n(result.height)+'mm" viewBox="0 0 '+n(result.width)+' '+n(result.height)+'">',
      '<title>Fixed-width text drawing</title>',
      '<desc>Text converted to pen paths. Spaces and line breaks retain their grid positions.</desc>',
      '<g fill="none" stroke="#000000" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round">',
      ...result.paths.map(path => '<path d="'+path.map(([x,y],i) => (i?'L':'M')+n(x)+' '+n(y)).join(' ')+'"/>'),
      '</g></svg>','',
    ].join('\n');
  }

  const api = {decode,kind,layout,svg,spacing};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextImport = api;
})(typeof window === 'undefined' ? globalThis : window);
