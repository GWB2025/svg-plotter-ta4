'use strict';
(function(root) {
  /** Stock and artwork share the same top-left origin, measured in mm. */
  function create({width, height, profile = {width:210,height:297}}) {
    width = Number(width); height = Number(height);
    if (!Number.isFinite(width) || !Number.isFinite(height) ||
        width < 1 || height < 1 || width > profile.width || height > profile.height) {
      throw Error(`Stock must be at least 1 mm on each side and fit the ${profile.width} × ${profile.height} mm bed.`);
    }
    const corner = Math.min(6, width / 5, height / 5);
    const tick = Math.min(4, width / 8, height / 8);
    const cx = width / 2, cy = height / 2;
    // All marks point inwards: even the A4 guide stays within bed limits.
    const paths = [
      [[0,corner], [0,0], [corner,0]],
      [[width-corner,0], [width,0], [width,corner]],
      [[width,height-corner], [width,height], [width-corner,height]],
      [[corner,height], [0,height], [0,height-corner]],
      [[cx,0], [cx,tick]], [[cx,height-tick], [cx,height]],
      [[0,cy], [tick,cy]], [[width-tick,cy], [width,cy]],
      [[cx-tick,cy], [cx+tick,cy]], [[cx,cy-tick], [cx,cy+tick]],
    ];
    paths.colours = paths.map(() => '#000000');
    paths.width = width; paths.height = height; paths.positioningGuide = true;
    const number = value => String(Number(value.toFixed(6)));
    const strokes = paths.map(path => '  <path d="' + path.map(([x,y],i) =>
      (i ? 'L' : 'M') + number(x) + ' ' + number(y)).join(' ') + '"/>');
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-plotter-guide="stock-v1">`,
      `<title>Stock positioning guide · ${width} × ${height} mm</title>`,
      '<desc>Plot at 100% onto a sacrificial carrier sheet fixed to the bed. The top-left corner is home X0 Y0. Align the stock with the four corner marks. Four inward ticks mark the edge centres; the cross marks the sheet centre. All dimensions are millimetres. Do not fit or scale this guide.</desc>',
      '<g fill="none" stroke="#000000" stroke-width="0.3" stroke-linecap="butt" stroke-linejoin="miter">',
      ...strokes, '</g>', '</svg>', '',
    ].join('\n');
    return {width, height, paths, svg, name:`positioning-guide-${width}x${height}mm.svg`};
  }
  const api = {create};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PageGuides = api;
})(typeof window === 'undefined' ? globalThis : window);
