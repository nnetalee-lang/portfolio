/* Neta-lee Artzi portfolio: small, optional enhancements.
   The site works without this file; it only adds the hero grain and the hobbies animation on the home page. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Film grain behind the hero: a few pre-rendered noise tiles, swapped slowly; one still tile with reduced motion ---------- */
  const GRAIN = { soft: { dark: .07, light: .55 } };
  const TILE = 180, FRAMES = 6;
  const tiles = {};
  function makeTiles(level) {
    if (tiles[level]) return tiles[level];
    const c = document.createElement("canvas"); c.width = c.height = TILE;
    const ctx = c.getContext("2d");
    const out = [];
    const { dark, light } = GRAIN[level];
    for (let f = 0; f < FRAMES; f++) {
      const img = ctx.createImageData(TILE, TILE), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = Math.random();
        if (r < 0.5) { d[i] = 15; d[i + 1] = 23; d[i + 2] = 43; d[i + 3] = Math.round(255 * dark * Math.random()); }
        else { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = Math.round(255 * light * Math.random()); }
      }
      ctx.putImageData(img, 0, 0);
      out.push(`url(${c.toDataURL("image/png")})`);
    }
    return (tiles[level] = out);
  }
  let grainLevel = "soft", grainTimer = 0, frame = 0;
  function grainRun() {
    clearInterval(grainTimer);
    const el = document.querySelector(".grain");
    if (!el) return;
    const t = makeTiles(grainLevel);
    el.style.backgroundImage = t[0];
    if (reduce.matches || document.hidden) return;
    grainTimer = setInterval(() => { frame = (frame + 1) % t.length; el.style.backgroundImage = t[frame]; }, 140);
  }


  /* ---------- Hobbies: Neta-lee's own animation, markup and timing kept; ids made unique per instance ---------- */
  const hobbyMarkup = u => `
<div class="hobbies" role="img" aria-label="Animated ink drawings of my hobbies: video games, board games, cooking and hosting, travel, Japan, skiing, and Chinese ink painting.">
  <div class="stage">
    <svg viewBox="0 24 200 120" aria-hidden="true">
      <defs>
        <filter id="${u}-brush" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1"/>
        </filter>
        <clipPath id="${u}-sky"><rect x="0" y="0" width="200" height="124"/></clipPath>
      </defs>
      <g filter="url(#${u}-brush)">
        <g class="scene" data-cap="I play video games">
          <rect class="ink" x="38" y="52" width="124" height="66" rx="16"/>
          <rect class="ink thin" x="72" y="62" width="56" height="44" rx="4"/>
          <path class="ink" d="M48 85h14M55 78v14"/>
          <circle class="ink thin" cx="146" cy="79" r="3.5"/>
          <circle class="ink thin" cx="138" cy="91" r="3.5"/>
          <g class="fx-star" style="transform-origin:100px 86px;opacity:0"><path class="red" d="M100 74l3.2 6.6 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1z"/></g>
        </g>
        <g class="scene" data-cap="I love board games">
          <g class="fx-die" style="transform-box:fill-box;transform-origin:center">
            <rect class="ink" x="44" y="76" width="34" height="34" rx="7"/>
            <circle class="solid pip" cx="54" cy="86" r="2.8"/><circle class="solid pip" cx="61" cy="93" r="2.8"/><circle class="solid pip" cx="68" cy="100" r="2.8"/>
          </g>
          <g class="fx-die" style="transform-box:fill-box;transform-origin:center">
            <rect class="ink" x="88" y="90" width="28" height="28" rx="6"/>
            <circle class="solid pip" cx="96" cy="98" r="2.5"/><circle class="solid pip" cx="108" cy="98" r="2.5"/><circle class="solid pip" cx="96" cy="110" r="2.5"/><circle class="solid pip" cx="108" cy="110" r="2.5"/>
          </g>
          <g class="fx-pawn">
            <circle class="ink" cx="148" cy="68" r="7"/>
            <path class="ink" d="M140 112c0-16 3-28 8-35 5 7 8 19 8 35z"/>
            <path class="ink" d="M134 112h28"/>
          </g>
          <path class="ink thin" d="M30 126h140"/>
        </g>
        <g class="scene" data-cap="I cook and host friends">
          <path class="ink" d="M56 90h88v20a16 16 0 0 1-16 16H72a16 16 0 0 1-16-16z"/>
          <path class="ink" d="M56 97h-9M144 97h9"/>
          <path class="ink" d="M62 90a38 13 0 0 1 76 0"/>
          <path class="ink" d="M95 77h10"/>
          <path class="ink thin" d="M158 126h18M160 114h14l-2 12h-10z"/>
          <path class="ink thin" d="M24 126h18M26 114h14l-2 12h-10z"/>
          <g class="fx-steam">
            <path class="ink thin" d="M84 66c-5-6 5-9 0-16"/>
            <path class="ink thin" d="M100 62c-5-6 5-9 0-16"/>
            <path class="ink thin" d="M116 66c-5-6 5-9 0-16"/>
          </g>
        </g>
        <g class="scene" data-cap="I travel the world">
          <path class="ink thin route" d="M34 118C64 50 106 140 130 82S166 64 172 59" stroke-dasharray="0.1 6" style="opacity:0"/>
          <circle class="ink thin" cx="34" cy="118" r="3"/>
          <path class="ink" d="M172 46c-7 0-11 5-11 10 0 7 11 17 11 17s11-10 11-17c0-5-4-10-11-10z" transform="translate(0 -14)"/>
          <circle class="solid" cx="172" cy="42" r="2.6"/>
          <g class="fx-plane" transform="translate(172 59) rotate(0)" style="opacity:0"><path class="solid" d="M-7-5 8 0-7 5-4 0z"/></g>
        </g>
        <g class="scene" data-cap="Japan, especially">
          <g clip-path="url(#${u}-sky)"><circle class="red fx-sun" cx="138" cy="54" r="15"/></g>
          <path class="ink" d="M24 124L82 62q18-12 36 0l58 62"/>
          <path class="ink thin" d="M82 62l8 11 10-7 10 7 8-11"/>
          <path class="ink" d="M14 124h172"/>
          <path class="ink thin" d="M40 136h40M110 136h56"/>
        </g>
        <g class="scene" data-cap="I go skiing">
          <path class="ink thin" d="M134 74l20-30 14 14 10-10 18 24"/>
          <path class="ink" d="M12 59L190 137"/>
          <path class="ink thin" d="M24 60.3L76 83"/>
          <g transform="translate(0 -4.5)"><g class="fx-skier">
            <path class="ink" d="M82 86.6l45 19.6"/>
            <path class="ink thin" d="M127 106.2c4 1.6 7 0 6-4.6"/>
            <path class="ink" d="M101 79l7 7-6 8.5"/>
            <path class="ink" d="M101 79l13 9-3 11"/>
            <path class="ink" d="M101 79l9-13"/>
            <path class="ink" d="M110 67l11 7"/>
            <path class="ink thin" d="M121 72l6 32"/>
            <circle class="ink" cx="115" cy="60" r="5"/>
            <path class="red" d="M109.4 59.4a5.6 5.6 0 0 1 11.2 0z"/>
            <circle class="red" cx="115" cy="52.4" r="2.1"/>
          </g></g>
          <g class="fx-snow">
            <circle class="solid" cx="40" cy="34" r="1.8"/><circle class="solid" cx="70" cy="44" r="1.5"/><circle class="solid" cx="96" cy="30" r="1.7"/>
            <circle class="solid" cx="140" cy="30" r="1.5"/><circle class="solid" cx="182" cy="38" r="1.8"/><circle class="solid" cx="24" cy="48" r="1.4"/>
          </g>
        </g>
        <g class="scene" data-cap="I paint with Chinese ink">
          <path class="ink" d="M70 136V112M70 108V84M70 80V56M70 52V30"/>
          <path class="ink" d="M70 82c10-10 24-12 36-8"/>
          <path class="ink" d="M70 58c-12-8-26-8-36-2"/>
          <path class="ink" d="M106 74c6 2 12 0 16-6M106 74c4 6 10 8 18 6"/>
          <path class="ink" d="M34 56c-4-6-10-8-16-6M34 56c-2 6-8 10-14 10"/>
          <g class="fx-brush">
            <path class="ink" d="M168 30l-30 44"/>
            <path class="ink" d="M136 76l-4 6"/>
            <path class="solid" d="M132 80c-4 4-7 10-6 14 3-1 8-6 10-11z"/>
          </g>
        </g>
      </g>
    </svg>
  </div>
  <div class="txt"><p class="lead">When I’m not designing</p><p class="cap" aria-hidden="true"></p></div>
</div>`;

  function Hobbies(host, uid) {
    host.innerHTML = hobbyMarkup(uid);
    const root = host.querySelector(".hobbies");
    const scenes = [...root.querySelectorAll(".scene")];
    const cap = root.querySelector(".cap");
    const EASE = "cubic-bezier(.65,0,.3,1)";
    let gen = 0, measured = false, loops = [];
    const wait = ms => new Promise(r => setTimeout(r, ms));
    function measure() {
      if (measured) return; measured = true;
      scenes.forEach(s => s.querySelectorAll(".ink").forEach(p => {
        if (p.classList.contains("route")) return;
        const L = Math.ceil(p.getTotalLength()) + 1; p.dataset.len = L;
        p.style.strokeDasharray = L; p.style.strokeDashoffset = reduce.matches ? 0 : L;
      }));
    }
    function setCaption(i) {
      cap.style.opacity = 0;
      setTimeout(() => { cap.textContent = scenes[i].dataset.cap; cap.style.opacity = 1; }, reduce.matches ? 0 : 250);
    }
    function extras(s) {
      const a = [];
      const star = s.querySelector(".fx-star");
      if (star) { star.style.opacity = 0;
        a.push(star.animate([{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)" }], { duration: 420, delay: 1100, easing: "cubic-bezier(.3,1.6,.5,1)", fill: "both" }));
        const t = setTimeout(() => a.push(star.animate([{ transform: "translateY(0)" }, { transform: "translateY(-6px)" }, { transform: "translateY(0)" }], { duration: 700, iterations: Infinity, easing: "ease-in-out", composite: "add" })), 1550);
        a.push({ cancel: () => clearTimeout(t) }); }
      s.querySelectorAll(".fx-steam path").forEach((p, k) => {
        const t = setTimeout(() => a.push(p.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-5px)", opacity: .35 }], { duration: 1200, delay: k * 200, iterations: Infinity, direction: "alternate", easing: "ease-in-out" })), 1400);
        a.push({ cancel: () => clearTimeout(t) });
      });
      s.querySelectorAll(".pip").forEach((p, k) => { p.style.opacity = 0; a.push(p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 900 + k * 70, fill: "both" })); });
      s.querySelectorAll(".fx-die").forEach((d, k) => a.push(d.animate([
        { transform: "translateY(0) rotate(0)" },
        { transform: "translateY(-14px) rotate(" + (k ? -90 : 90) + "deg)", offset: .45 },
        { transform: "translateY(0) rotate(" + (k ? -90 : 90) + "deg)", offset: .8 },
        { transform: "translateY(-2px) rotate(" + (k ? -90 : 90) + "deg)", offset: .9 },
        { transform: "translateY(0) rotate(" + (k ? -90 : 90) + "deg)" }], { duration: 900, delay: 1700 + k * 120, easing: "ease-out", fill: "forwards" })));
      const pawn = s.querySelector(".fx-pawn");
      if (pawn) a.push(pawn.animate([{ transform: "translateY(0)" }, { transform: "translateY(-8px)" }, { transform: "translateY(0)" }], { duration: 520, delay: 2000, iterations: 2, easing: "ease-in-out" }));
      const route = s.querySelector(".route"), plane = s.querySelector(".fx-plane");
      if (route) { route.style.opacity = 0;
        a.push(route.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: "forwards" }));
        plane.style.opacity = 0;
        const L = route.getTotalLength(), t0 = performance.now() + 300;
        let raf;
        const step = t => { const k = Math.min(1, Math.max(0, (t - t0) / 2200)); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const d = e * L, p = route.getPointAtLength(d), q = route.getPointAtLength(Math.min(L, d + 1));
          const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
          plane.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${ang})`);
          plane.style.opacity = k > 0 && k < .97 ? 1 : 0;
          if (k < 1) raf = requestAnimationFrame(step); };
        raf = requestAnimationFrame(step);
        a.push({ cancel: () => cancelAnimationFrame(raf) }); }
      const sun = s.querySelector(".fx-sun");
      if (sun) a.push(sun.animate([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }], { duration: 1600, delay: 500, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }));
      const skier = s.querySelector(".fx-skier");
      if (skier) a.push(skier.animate([{ transform: "translate(-22px,-10px)" }, { transform: "translate(0,0)" }], { duration: 1700, delay: 900, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }));
      s.querySelectorAll(".fx-snow circle").forEach((c, k) => a.push(c.animate([{ transform: "translate(0,-6px)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: "translate(3px,16px)", opacity: 0 }], { duration: 1800, delay: k * 260, iterations: Infinity, easing: "linear" })));
      const brush = s.querySelector(".fx-brush");
      if (brush) a.push(brush.animate([{ transform: "translate(0,0)" }, { transform: "translate(-3px,3px)" }, { transform: "translate(0,0)" }], { duration: 900, iterations: Infinity, easing: "ease-in-out" }));
      return a;
    }
    function reset(s) {
      loops.forEach(a => a.cancel && a.cancel()); loops = [];
      s.getAnimations({ subtree: true }).forEach(a => a.cancel());
      s.style.opacity = 0;
      s.querySelectorAll(".ink").forEach(p => { if (p.dataset.len) p.style.strokeDashoffset = reduce.matches ? 0 : p.dataset.len; });
    }
    async function play(i, g) {
      const s = scenes[i];
      setCaption(i);
      s.style.opacity = 1;
      if (reduce.matches) { await wait(2800); if (g === gen) s.style.opacity = 0; return; }
      const inks = [...s.querySelectorAll(".ink")].filter(p => p.dataset.len);
      inks.forEach((p, j) => p.animate([{ strokeDashoffset: p.dataset.len }, { strokeDashoffset: 0 }], { duration: 900, delay: j * 160, easing: EASE, fill: "forwards" }));
      loops = extras(s);
      await wait(900 + inks.length * 160 + 1900);
      if (g !== gen) return;
      await s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-in", fill: "forwards" }).finished;
      reset(s);
    }
    return {
      async start() {
        measure();
        const g = ++gen;
        for (let i = 0; g === gen; i = (i + 1) % scenes.length) await play(i, g);
      },
      stop() { gen++; scenes.forEach(reset); }
    };
  }


  /* ---------- Start ---------- */
  /* The grain only moves while the hero is on screen, so it never runs in the background */
  const grainEl = document.querySelector(".grain");
  if (grainEl) {
    let heroVisible = true;
    const sync = () => { if (heroVisible && !document.hidden) grainRun(); else clearInterval(grainTimer); };
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; sync(); }).observe(grainEl);
    document.addEventListener("visibilitychange", sync);
  }
  const slot = document.querySelector("[data-hobbies]");
  if (slot) {
    const hob = Hobbies(slot, "hob");
    hob.start();
    reduce.addEventListener?.("change", () => { grainRun(); hob.stop(); hob.start(); });
  }
})();

/* Sticky header: a light surface once the page scrolls */
(function () {
  var h = document.querySelector(".site-header:not(.plain)");
  if (!h) return;
  var on = function () { h.classList.toggle("scrolled", window.scrollY > 8); };
  on(); window.addEventListener("scroll", on, { passive: true });
})();
