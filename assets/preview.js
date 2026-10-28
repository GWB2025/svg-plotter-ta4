'use strict';
(function(root) {
  const nextFrame = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });

  // Keep the full plotting geometry; only its on-screen representation is rasterised.
  // Bound each canvas batch as well as the time spent before returning to the UI.
  async function paintPaths(context, paths, colours = [], options = {}) {
    const {yieldControl = nextFrame, now = () => performance.now(),
      isCurrent = () => true, colour = '#203832', dots = true} = options;
    let started = now(), points = 0, pending = false, ink = null;
    context.beginPath();
    function flush() {
      if (pending) context.stroke();
      context.beginPath();
      pending = false;
    }
    async function checkpoint() {
      flush();
      points = 0;
      if (now() - started >= 6) {
        await yieldControl();
        if (!isCurrent()) return false;
        started = now();
      }
      return isCurrent();
    }
    for (let index = 0; index < paths.length; index++) {
      if (!isCurrent()) return;
      const path = paths[index];
      if (!path.length) continue;
      const nextInk = colours[index] || colour;
      if (nextInk !== ink) {
        flush();
        ink = nextInk;
        context.strokeStyle = context.fillStyle = ink;
      }
      const [x, y] = path[0];
      if (dots && path.every(p => p[0] === x && p[1] === y)) {
        flush();
        context.arc(x, y, .15, 0, 2 * Math.PI);
        context.fill();
        context.beginPath();
        points += path.length;
      } else {
        context.moveTo(x, y);
        points++;
        for (let i = 1; i < path.length; i++) {
          context.lineTo(...path[i]);
          pending = true;
          if (++points >= 2048) {
            if (!await checkpoint()) return;
            context.moveTo(...path[i]);
          }
        }
      }
      if (points >= 2048 && !await checkpoint()) return;
    }
    flush();
  }

  class CanvasPreview {
    constructor(ink, travel) {
      this.ink = ink;
      this.travel = travel;
      this.version = 0;
      this.job = null;
      this.travelTask = null;
    }

    async render(job, page, showTravel = false) {
      const version = ++this.version;
      this.job = job;
      this.travelTask = null;
      this.travel.hidden = !showTravel;
      const scale = Math.min(4096 / Math.max(page.width, page.height),
        Math.max(8, (this.ink.clientWidth || 600) * (root.devicePixelRatio || 2) / page.width));
      for (const canvas of [this.ink, this.travel]) {
        // Resizing clears the bitmap and resets all drawing state.
        canvas.width = Math.ceil(page.width * scale);
        canvas.height = Math.ceil(page.height * scale);
        const context = canvas.getContext('2d');
        context.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
        context.lineWidth = canvas === this.ink ? .3 : .25;
        context.lineCap = context.lineJoin = 'round';
        context.setLineDash(canvas === this.travel ? [1, 1] : []);
      }
      if (!job) return;
      await nextFrame();
      if (version !== this.version) return;
      await Promise.all([
        paintPaths(this.ink.getContext('2d'), job.paths || [], job.path_colours || [],
          {isCurrent: () => version === this.version}),
        this.showTravel(!this.travel.hidden),
      ]);
    }

    showTravel(visible) {
      this.travel.hidden = !visible;
      if (!visible || !this.job) return Promise.resolve();
      if (!this.travelTask) {
        const version = this.version;
        this.travelTask = paintPaths(this.travel.getContext('2d'), this.job.travel || [], [],
          {colour:'#7c9aad', dots:false, isCurrent: () => version === this.version});
      }
      return this.travelTask;
    }
  }

  const api = {paintPaths, CanvasPreview};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PlotPreview = api;
})(typeof window === 'undefined' ? globalThis : window);
