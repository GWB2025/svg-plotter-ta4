const results = document.getElementById('results');
const wrap = content => '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">' + content + '</svg>';
const check = (name, fn) => { try { fn(); results.textContent += 'PASS ' + name + '\n'; } catch (e) { results.textContent += 'FAIL ' + name + ': ' + e.message + '\n'; } };
const close = (a, b) => { if (Math.abs(a - b) > 0.01) throw Error(a + ' != ' + b); };
check('millimetres and transforms', () => {
  const p = SVGImport.extractPaths(wrap('<g transform="translate(10 20)"><path d="M10 10L20 30"/></g>'))[0];
  close(p[0][0], 20); close(p[0][1], 30); close(p.at(-1)[0], 30); close(p.at(-1)[1], 50);
});
check('separate absolute subpaths', () => {
  const p = SVGImport.extractPaths(wrap('<path d="M10 10L20 20M50 50L60 60"/>'));
  if (p.length !== 2) throw Error('Separate strokes were joined');
  close(p[1][0][0], 50);
});
check('relative subpaths with implicit lines', () => {
  const p = SVGImport.extractPaths(wrap('<path d="m10 10 10 0 m20 30 10 0"/>'));
  close(p[0].at(-1)[0], 20); close(p[1][0][0], 40); close(p[1][0][1], 40); close(p[1].at(-1)[0], 50);
});
check('curves and geometric shapes', () => {
  const p = SVGImport.extractPaths(wrap('<path d="M10 10C10 50 50 50 50 10"/><circle cx="100" cy="100" r="10"/><rect x="20" y="20" width="30" height="20"/>'));
  if (p.length !== 3 || p[0].length < 10) throw Error('Curves were not sampled');
});
check('hidden paths are omitted', () => {
  const p = SVGImport.extractPaths(wrap('<g display="none"><path d="M0 0L100 100"/></g><path d="M10 10L20 20"/>'));
  if (p.length !== 1) throw Error('Hidden path was exported');
});
for (const [name, content] of [['text', '<text x="10" y="10">Hello</text>'], ['clip', '<path clip-path="url(#a)" d="M1 1L2 2"/>'], ['script', '<script>alert(1)</script>']]) {
  check('rejects ' + name, () => { let rejected = false; try { SVGImport.extractPaths(wrap(content)); } catch { rejected = true; } if (!rejected) throw Error('Unsupported content was accepted'); });
}
