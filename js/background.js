/* ════════════════════════════════════════════════════════════════════
   LYRAFORGE — Animated Canvas Background Engine v2
   6 canvas layers: base | stars | nebula | network | particles | bloom
   ════════════════════════════════════════════════════════════════════ */
"use strict";

(function () {
  const $ = id => document.getElementById(id);
  const cBase = $('c-base'), cStars = $('c-stars'), cNebula = $('c-nebula');
  const cNet  = $('c-net'),  cPart  = $('c-part'),  cBloom  = $('c-bloom');
  const ALL   = [cBase, cStars, cNebula, cNet, cPart, cBloom];

  const gBase  = cBase.getContext('2d');
  const gStars = cStars.getContext('2d');
  const gNeb   = cNebula.getContext('2d');
  const gNet   = cNet.getContext('2d');
  const gPart  = cPart.getContext('2d');
  const gBloom = cBloom.getContext('2d');
  const CTX    = [gBase, gStars, gNeb, gNet, gPart, gBloom];

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0, tick = 0, edgeAge = 0;
  let resizeTimer, lastResizeW = 0;

  // ── Resize ─────────────────────────────────────────────────────────
  function resize() {
    const newW = window.innerWidth;
    const newH = window.innerHeight;
    // Ignore height-only changes under 160px — mobile address bar show/hide
    if (newW === lastResizeW && Math.abs(newH - H) < 160) return;
    lastResizeW = newW;
    W = newW; H = newH;
    ALL.forEach(c => {
      c.width = W * DPR; c.height = H * DPR;
      c.style.width = W + 'px'; c.style.height = H + 'px';
    });
    CTX.forEach(ctx => { ctx.setTransform(1,0,0,1,0,0); ctx.scale(DPR, DPR); });
    drawBase();
    initStars(); initNebulae(); initNetwork(); initParticles();
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ════════════════════════════════════════════════════════════════════
  // LAYER 1 — BASE GRADIENT (drawn once)
  // ════════════════════════════════════════════════════════════════════
  function drawBase() {
    const g = gBase.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, '#000007');
    g.addColorStop(0.12, '#01070f');
    g.addColorStop(0.30, '#020c1e');
    g.addColorStop(0.55, '#031228');
    g.addColorStop(0.78, '#04162e');
    g.addColorStop(1.00, '#031a2c');
    gBase.fillStyle = g; gBase.fillRect(0, 0, W, H);

    // Warm forge heat at bottom
    const heat = gBase.createLinearGradient(0, H * 0.78, 0, H);
    heat.addColorStop(0, 'rgba(0,0,0,0)');
    heat.addColorStop(1, 'rgba(22, 9, 2, 0.6)');
    gBase.fillStyle = heat; gBase.fillRect(0, 0, W, H);

    // Deep aurora wash at top — teal + purple ambient light
    const auroraBg = gBase.createLinearGradient(0, 0, 0, H * 0.45);
    auroraBg.addColorStop(0,    'rgba(0,245,196,0.04)');
    auroraBg.addColorStop(0.35, 'rgba(124,58,237,0.05)');
    auroraBg.addColorStop(1,    'rgba(0,0,0,0)');
    gBase.fillStyle = auroraBg; gBase.fillRect(0, 0, W, H);
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYER 2 — STARFIELD + LYRA CONSTELLATION
  // ════════════════════════════════════════════════════════════════════
  const STARS = [];
  const LYRA = [
    { n:'Vega',    x:.715, y:.078, s:4.0, c:'#c8e4ff' },
    { n:'ε¹²',    x:.663, y:.128, s:1.3, c:'#d4e8ff' },
    { n:'ζ',       x:.750, y:.138, s:1.5, c:'#bcd2ff' },
    { n:'Sheliak', x:.660, y:.196, s:1.7, c:'#cce0ff' },
    { n:'δ²',      x:.700, y:.212, s:1.2, c:'#ffeacc' },
    { n:'Sulafat', x:.752, y:.202, s:1.8, c:'#c0d8ff' },
  ];
  const LYRA_L = [[0,1],[0,2],[1,3],[2,5],[3,4],[4,5],[3,5]];

  function initStars() {
    STARS.length = 0;
    const n = Math.floor(W * H / 700);
    for (let i = 0; i < n; i++) {
      const depth = Math.random();
      STARS.push({
        x: Math.random() * W,
        y: Math.pow(Math.random(), 0.62) * H * 0.90,
        r: depth * 1.25 + 0.15,
        a: Math.random() * 0.6 + 0.35,
        ts: Math.random() * 0.024 + 0.004,
        tp: Math.random() * Math.PI * 2,
        c: starColor(),
      });
    }
  }

  function starColor() {
    const p = Math.random();
    if (p < .60) return '#ffffff';
    if (p < .76) return '#ddeeff';
    if (p < .87) return '#c8e0ff';
    if (p < .93) return '#ffeedd';
    return '#bbccff';
  }

  function drawStars() {
    gStars.clearRect(0, 0, W, H);

    // Milky Way suggestion
    for (let b = 0; b < 5; b++) {
      const bx = W * (.06 + b * .21), by = H * (.02 + b * .06);
      const bw = W * .17, bh = H * .44;
      const cl = gStars.createRadialGradient(bx, by, 0, bx, by + bh * .5, Math.max(bw, bh) * .7);
      cl.addColorStop(0, 'rgba(38, 68, 138, 0.05)'); cl.addColorStop(1, 'rgba(0,0,0,0)');
      gStars.fillStyle = cl; gStars.fillRect(0, 0, W, H);
    }

    STARS.forEach(st => {
      const tw = Math.sin(tick * st.ts + st.tp) * .27 + .73;
      gStars.save(); gStars.globalAlpha = st.a * tw;
      if (st.r > .72) {
        const gr = gStars.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 3.4);
        gr.addColorStop(0, st.c); gr.addColorStop(1, 'rgba(0,0,0,0)');
        gStars.fillStyle = gr; gStars.beginPath(); gStars.arc(st.x, st.y, st.r * 3.4, 0, Math.PI*2); gStars.fill();
      }
      gStars.fillStyle = st.c; gStars.beginPath(); gStars.arc(st.x, st.y, st.r, 0, Math.PI*2); gStars.fill();
      gStars.restore();
    });

    drawLyra();
  }

  function drawLyra() {
    const sc = LYRA.map(s => ({ ...s, sx: s.x * W, sy: s.y * H }));

    LYRA_L.forEach(([a, b]) => {
      gStars.save();
      gStars.globalAlpha = .22 + Math.sin(tick * .006) * .06;
      gStars.setLineDash([4, 10]);
      gStars.lineDashOffset = tick * .28;
      gStars.strokeStyle = 'rgba(140, 195, 255, 0.90)';
      gStars.lineWidth = .7;
      gStars.beginPath();
      gStars.moveTo(sc[a].sx, sc[a].sy);
      gStars.lineTo(sc[b].sx, sc[b].sy);
      gStars.stroke();
      gStars.restore();
    });

    sc.forEach((star, i) => {
      const isVega = i === 0;
      const tw = Math.sin(tick * .017 + i * .93) * .22 + .78;
      const glowR = isVega ? 26 : star.s * 7;

      gStars.save();
      const halo = gStars.createRadialGradient(star.sx, star.sy, 0, star.sx, star.sy, glowR * 2.3);
      halo.addColorStop(0, `rgba(200,228,255,${.36 * tw})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
      gStars.fillStyle = halo; gStars.beginPath(); gStars.arc(star.sx, star.sy, glowR * 2.3, 0, Math.PI*2); gStars.fill();
      const inn = gStars.createRadialGradient(star.sx, star.sy, 0, star.sx, star.sy, glowR);
      inn.addColorStop(0, `rgba(255,255,255,${tw})`); inn.addColorStop(.4, `rgba(200,228,255,${.58*tw})`); inn.addColorStop(1, 'rgba(0,0,0,0)');
      gStars.fillStyle = inn; gStars.beginPath(); gStars.arc(star.sx, star.sy, glowR, 0, Math.PI*2); gStars.fill();
      if (isVega || star.s >= 1.7) {
        const sl = isVega ? 21 : 10;
        gStars.globalAlpha = .55 * tw; gStars.strokeStyle = 'rgba(220,238,255,.9)'; gStars.lineWidth = .65;
        [0, Math.PI*.5, Math.PI, Math.PI*1.5].forEach(a => {
          gStars.beginPath();
          gStars.moveTo(star.sx + Math.cos(a)*2.5, star.sy + Math.sin(a)*2.5);
          gStars.lineTo(star.sx + Math.cos(a)*sl,  star.sy + Math.sin(a)*sl);
          gStars.stroke();
        });
        gStars.globalAlpha = .26 * tw;
        [Math.PI*.25, Math.PI*.75, Math.PI*1.25, Math.PI*1.75].forEach(a => {
          const d = sl * .52;
          gStars.beginPath();
          gStars.moveTo(star.sx + Math.cos(a)*2, star.sy + Math.sin(a)*2);
          gStars.lineTo(star.sx + Math.cos(a)*d, star.sy + Math.sin(a)*d);
          gStars.stroke();
        });
      }
      gStars.globalAlpha = tw; gStars.fillStyle = '#ffffff';
      gStars.beginPath(); gStars.arc(star.sx, star.sy, star.s*.52, 0, Math.PI*2); gStars.fill();
      if (isVega) {
        gStars.globalAlpha = .42 + Math.sin(tick * .008) * .08;
        gStars.fillStyle = 'rgba(180,220,255,1)';
        gStars.font = "300 10px 'Raleway', sans-serif";
        gStars.fillText('VEGA', star.sx + 13, star.sy - 9);
        gStars.globalAlpha = .24;
        gStars.fillText('α LYRAE', star.sx + 13, star.sy + 3);
      }
      gStars.restore();
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYER 3 — NEBULA CLOUDS (enhanced opacity)
  // ════════════════════════════════════════════════════════════════════
  const NEBS = [
    { cx:.17, cy:.11, rx:.22, ry:.18, ca:'rgba(0,180,210,', cb:'rgba(80,20,180,'  },
    { cx:.54, cy:.21, rx:.28, ry:.14, ca:'rgba(0,220,190,', cb:'rgba(0,100,200,'  },
    { cx:.82, cy:.15, rx:.20, ry:.16, ca:'rgba(100,20,200,', cb:'rgba(0,160,220,' },
    { cx:.37, cy:.05, rx:.16, ry:.10, ca:'rgba(200,120,20,', cb:'rgba(200,60,10,' },
    { cx:.65, cy:.08, rx:.14, ry:.09, ca:'rgba(0,245,196,',  cb:'rgba(124,58,237,'},
  ].map((d, i) => ({ ...d, phase: i * Math.PI * .7, sp: .003 + i * .001 }));

  function initNebulae() {}

  function drawNebulae() {
    gNeb.clearRect(0, 0, W, H);
    NEBS.forEach(nb => {
      const br = Math.sin(tick * nb.sp + nb.phase) * .28 + .72;
      const cx = nb.cx * W, cy = nb.cy * H, rx = nb.rx * W * br, ry = nb.ry * H * br;
      gNeb.save();
      gNeb.globalAlpha = .038 * br;
      const scaleY = ry / rx;
      gNeb.transform(1, 0, 0, scaleY, 0, cy * (1 - scaleY));
      const gr = gNeb.createRadialGradient(cx, cy/scaleY, 0, cx, cy/scaleY, rx);
      gr.addColorStop(0, nb.ca + '.9)'); gr.addColorStop(.45, nb.cb + '.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      gNeb.fillStyle = gr; gNeb.beginPath(); gNeb.arc(cx, cy/scaleY, rx, 0, Math.PI*2); gNeb.fill();
      gNeb.restore();
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYER 4 — NETWORK (nodes + edges + data packets)
  // ════════════════════════════════════════════════════════════════════
  const NODES = [], EDGES = [];
  const nNodes   = () => Math.min(Math.floor(W * H / 8000), 100);
  const connDist = () => Math.min(W, H) * 0.23;

  function initNetwork() {
    NODES.length = 0; EDGES.length = 0;
    const n = nNodes();
    for (let i = 0; i < n; i++) {
      const tier = Math.random();
      const yBase = tier < .14 ? .30 : tier < .55 ? .40 : .62;
      NODES.push({
        x: Math.random() * W, y: H * (yBase + Math.random() * .28),
        vx: (Math.random()-.5)*.17, vy: (Math.random()-.5)*.09,
        r:  Math.random() * 3.5 + 1.8,
        ps: Math.random() * .022 + .007, pp: Math.random() * Math.PI * 2,
        type: Math.random() < .14 ? 'forge' : 'net',
        hub: Math.random() < .08,
      });
    }
    buildEdges();
  }

  function buildEdges() {
    EDGES.length = 0;
    const d = connDist();
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const dx = NODES[i].x - NODES[j].x, dy = NODES[i].y - NODES[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < d) EDGES.push({ a:i, b:j, d:dist,
          pkts: Math.random() < .30 ? [{t:Math.random(), sp:Math.random()*.0035+.001, dir:Math.random()<.5?1:-1}] : [],
        });
      }
    }
  }

  function updateNetwork() {
    const minY = H * .27, maxY = H * .97;
    NODES.forEach(nd => {
      nd.x += nd.vx; nd.y += nd.vy;
      if (nd.x < -60) nd.x = W+60; if (nd.x > W+60) nd.x = -60;
      if (nd.y < minY) { nd.y = minY; nd.vy = Math.abs(nd.vy); }
      if (nd.y > maxY) { nd.y = maxY; nd.vy = -Math.abs(nd.vy); }
    });
    EDGES.forEach(e => e.pkts.forEach(p => {
      p.t += p.sp * p.dir;
      if (p.t > 1 || p.t < 0) p.t = p.dir > 0 ? 0 : 1;
    }));
  }

  function drawNetwork() {
    gNet.clearRect(0, 0, W, H);
    const hy = H * .385;

    // Stronger atmospheric glow at horizon — matches AI image aesthetic
    const atm = gNet.createRadialGradient(W*.5, hy, 0, W*.5, hy, W*.6);
    atm.addColorStop(0,  'rgba(0,245,196,.09)');
    atm.addColorStop(.25,'rgba(0,180,220,.055)');
    atm.addColorStop(.5, 'rgba(124,58,237,.035)');
    atm.addColorStop(1,  'rgba(0,0,0,0)');
    gNet.fillStyle = atm; gNet.fillRect(0, 0, W, H);

    // Earth glow band — warm teal arc at horizon
    const earthGlow = gNet.createRadialGradient(W*.5, hy + H*.06, H*.04, W*.5, hy, W*.38);
    earthGlow.addColorStop(0,   'rgba(0,245,196,.06)');
    earthGlow.addColorStop(.35, 'rgba(0,180,200,.035)');
    earthGlow.addColorStop(1,   'rgba(0,0,0,0)');
    gNet.fillStyle = earthGlow; gNet.fillRect(0, 0, W, H);

    // Curved horizon line — brighter
    gNet.save();
    const hg = gNet.createLinearGradient(0, hy, W, hy);
    hg.addColorStop(0,    'rgba(0,220,180,0)');
    hg.addColorStop(0.14, 'rgba(0,220,180,.65)');
    hg.addColorStop(0.5,  'rgba(0,245,196,1.0)');
    hg.addColorStop(0.86, 'rgba(0,180,220,.65)');
    hg.addColorStop(1,    'rgba(0,180,220,0)');
    gNet.strokeStyle = hg; gNet.lineWidth = 1.3;
    gNet.globalAlpha = .24 + Math.sin(tick*.007) * .07;
    const crv = H * .028;
    gNet.beginPath();
    gNet.moveTo(0, hy + crv);
    gNet.bezierCurveTo(W*.28, hy - crv*.4, W*.72, hy - crv*.4, W, hy + crv);
    gNet.stroke();
    // Glow below horizon line
    const hGl = gNet.createLinearGradient(0, hy-2, 0, hy+72);
    hGl.addColorStop(0, 'rgba(0,245,196,.20)'); hGl.addColorStop(1, 'rgba(0,0,0,0)');
    gNet.globalAlpha = .65; gNet.fillStyle = hGl; gNet.fillRect(0, hy-2, W, 75);
    gNet.restore();

    drawGrid(hy);

    // Edges
    const md = connDist();
    EDGES.forEach(e => {
      const na = NODES[e.a], nb = NODES[e.b];
      const fade = 1 - e.d / md;
      const alpha = fade * fade * .52;
      if (alpha < .008) return;
      const isF = na.type === 'forge' || nb.type === 'forge';

      gNet.save(); gNet.globalAlpha = alpha;
      if (isF) {
        gNet.strokeStyle = 'rgba(245,155,10,.90)';
      } else {
        const eg = gNet.createLinearGradient(na.x, na.y, nb.x, nb.y);
        eg.addColorStop(0,   'rgba(0,212,255,.95)');
        eg.addColorStop(.38, 'rgba(0,245,196,.85)');
        eg.addColorStop(.62, 'rgba(0,200,255,.85)');
        eg.addColorStop(1,   'rgba(124,58,237,.95)');
        gNet.strokeStyle = eg;
      }
      gNet.lineWidth = fade * 1.4 + .25;
      gNet.beginPath(); gNet.moveTo(na.x, na.y); gNet.lineTo(nb.x, nb.y); gNet.stroke();

      e.pkts.forEach(pk => {
        const px = na.x + (nb.x-na.x)*pk.t, py = na.y + (nb.y-na.y)*pk.t;
        const pg = gNet.createRadialGradient(px,py,0,px,py,6);
        pg.addColorStop(0, isF ? 'rgba(251,191,36,1)' : 'rgba(0,245,196,1)'); pg.addColorStop(1,'rgba(0,0,0,0)');
        gNet.globalAlpha = fade*.98; gNet.fillStyle = pg;
        gNet.beginPath(); gNet.arc(px, py, 6, 0, Math.PI*2); gNet.fill();
      });
      gNet.restore();
    });

    // Nodes
    NODES.forEach(nd => {
      const pulse = Math.sin(tick * nd.ps + nd.pp) * .38 + .62;
      const isF   = nd.type === 'forge';
      const r     = nd.r * (nd.hub ? 1.9 : 1);
      const cC    = isF ? '#f59e0b' : '#00d4ff';
      const gS    = isF ? 'rgba(245,158,11,' : 'rgba(0,212,255,';
      const gS2   = isF ? 'rgba(251,146,60,' : 'rgba(0,245,196,';
      const glR   = r * (2.8 + pulse * 2.5);

      gNet.save();
      const og = gNet.createRadialGradient(nd.x, nd.y, r*.5, nd.x, nd.y, glR*2.2);
      og.addColorStop(0, `${gS}${.30*pulse})`); og.addColorStop(.5, `${gS2}${.12*pulse})`); og.addColorStop(1,'rgba(0,0,0,0)');
      gNet.fillStyle = og; gNet.beginPath(); gNet.arc(nd.x, nd.y, glR*2.2, 0, Math.PI*2); gNet.fill();

      const ig = gNet.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, glR);
      ig.addColorStop(0, cC); ig.addColorStop(.45, `${gS}${.60*pulse})`); ig.addColorStop(1,'rgba(0,0,0,0)');
      gNet.fillStyle = ig; gNet.beginPath(); gNet.arc(nd.x, nd.y, glR, 0, Math.PI*2); gNet.fill();

      gNet.fillStyle = isF ? '#fde68a' : 'rgba(220,245,255,.98)';
      gNet.beginPath(); gNet.arc(nd.x, nd.y, r*.55, 0, Math.PI*2); gNet.fill();

      if (nd.hub) {
        gNet.globalAlpha = .35 * pulse; gNet.strokeStyle = cC; gNet.lineWidth = .9;
        gNet.beginPath(); gNet.arc(nd.x, nd.y, r*2.2, 0, Math.PI*2); gNet.stroke();
      }
      gNet.restore();
    });
  }

  function drawGrid(hy) {
    gNet.save();
    // Brighter perspective grid — matches the glowing grid lines in AI images
    gNet.globalAlpha = .065;
    gNet.strokeStyle = 'rgba(0,212,255,1)'; gNet.lineWidth = .55;
    const step = 80, vx = W * .5;
    for (let y = hy; y < H + step; y += step * Math.max((y-hy)/(H-hy)*.85+.15, .15)) {
      gNet.beginPath(); gNet.moveTo(0,y); gNet.lineTo(W,y); gNet.stroke();
    }
    const nl = 24;
    for (let i = 0; i <= nl; i++) {
      const bx = (i/nl)*W;
      gNet.beginPath(); gNet.moveTo(vx+(bx-vx)*.08, hy); gNet.lineTo(bx, H); gNet.stroke();
    }
    // Secondary grid layer — tighter with warm overlay near center
    gNet.globalAlpha = .022;
    gNet.strokeStyle = 'rgba(245,158,11,1)'; gNet.lineWidth = .4;
    const nl2 = 8;
    for (let i = 0; i <= nl2; i++) {
      const bx = (i/nl2)*W;
      gNet.beginPath(); gNet.moveTo(vx+(bx-vx)*.08, hy); gNet.lineTo(bx, H); gNet.stroke();
    }
    gNet.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYER 5 — PARTICLES (forge sparks + data motes)
  // ════════════════════════════════════════════════════════════════════
  const PARTS = [];
  const MAX_P = 170;

  function initParticles() {
    PARTS.length = 0;
    for (let i = 0; i < MAX_P; i++) spawnParticle(true);
  }

  function spawnParticle(init) {
    const isF = Math.random() < .24;
    PARTS.push({
      x: Math.random()*W, y: init ? Math.random()*H : H+15,
      vx: (Math.random()-.5)*.52, vy: -(Math.random()*.88+.22),
      r: Math.random()*1.8+.4, life: 1,
      dec: Math.random()*.0027+.0008,
      isF, trail: [], maxT: Math.floor(Math.random()*18+5),
      spin: Math.random()-.5,
    });
  }

  function updateParticles() {
    for (let i = PARTS.length-1; i >= 0; i--) {
      const p = PARTS[i];
      p.trail.push({x:p.x, y:p.y});
      if (p.trail.length > p.maxT) p.trail.shift();
      p.x += p.vx; p.y += p.vy;
      p.vx += p.spin * .014; p.vy -= .0017;
      p.life -= p.dec;
      if (p.life <= 0 || p.y < -30) { PARTS.splice(i,1); spawnParticle(false); }
    }
  }

  function drawParticles() {
    gPart.clearRect(0, 0, W, H);
    PARTS.forEach(p => {
      if (p.trail.length < 2) return;
      gPart.save();
      for (let i = 1; i < p.trail.length; i++) {
        const t = i/p.trail.length;
        gPart.globalAlpha = t*p.life*.72;
        gPart.strokeStyle = p.isF ? 'rgba(251,191,36,1)' : 'rgba(0,212,255,1)';
        gPart.lineWidth = p.r*t*.9;
        gPart.beginPath(); gPart.moveTo(p.trail[i-1].x,p.trail[i-1].y); gPart.lineTo(p.trail[i].x,p.trail[i].y); gPart.stroke();
      }
      gPart.globalAlpha = p.life*.92;
      const hg = gPart.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3.6);
      hg.addColorStop(0, p.isF ? 'rgba(253,211,77,1)' : 'rgba(0,245,196,1)'); hg.addColorStop(1,'rgba(0,0,0,0)');
      gPart.fillStyle = hg; gPart.beginPath(); gPart.arc(p.x,p.y,p.r*3.6,0,Math.PI*2); gPart.fill();
      gPart.restore();
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYER 6 — BLOOM / AURORA / BOKEH / VIGNETTE (enhanced)
  // ════════════════════════════════════════════════════════════════════
  const BOKEH = Array.from({length:12}, (_,i) => ({
    xf: Math.random(), yf: .28 + Math.random()*.58,
    r: 60 + Math.random()*100, sp: (Math.random()-.5)*.00017,
    ph: i*Math.PI*.62 + Math.random()*Math.PI,
    warm: Math.random() < .22,
  }));

  function drawBloom() {
    gBloom.clearRect(0, 0, W, H);
    const hy = H * .385;

    // Horizon glow band
    const band = gBloom.createLinearGradient(0, hy-62, 0, hy+82);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(.35,'rgba(0,200,180,.055)');
    band.addColorStop(.62,'rgba(0,160,200,.038)');
    band.addColorStop(1,'rgba(0,0,0,0)');
    gBloom.fillStyle = band; gBloom.fillRect(0,0,W,H);

    // Enhanced aurora shimmer — 5 blobs with stronger teal/purple matching AI images
    const auroraConfigs = [
      { x:.10, c0:'rgba(0,245,196,', c1:'rgba(124,58,237,', sp:.004, dy:-42 },
      { x:.35, c0:'rgba(124,58,237,', c1:'rgba(0,212,255,', sp:.0055,dy:-28 },
      { x:.58, c0:'rgba(0,220,190,', c1:'rgba(168,85,247,', sp:.005, dy:-38 },
      { x:.76, c0:'rgba(168,85,247,', c1:'rgba(0,200,255,', sp:.0045,dy:-22 },
      { x:.92, c0:'rgba(0,245,196,', c1:'rgba(124,58,237,', sp:.005, dy:-35 },
    ];
    auroraConfigs.forEach((ac, a) => {
      const ax = W * ac.x, ar = W * .22;
      const ba = .048 + Math.sin(tick * ac.sp + a * 1.2) * .018;
      const ag = gBloom.createRadialGradient(ax, hy + ac.dy, 0, ax, hy + ac.dy, ar);
      ag.addColorStop(0, ac.c0 + ba + ')');
      ag.addColorStop(.5, ac.c1 + (ba*.55) + ')');
      ag.addColorStop(1,'rgba(0,0,0,0)');
      gBloom.fillStyle = ag; gBloom.fillRect(0,0,W,H);
    });

    // Aurora curtains — vertical streaks for depth
    for (let s = 0; s < 3; s++) {
      const sx = W * (.22 + s * .28);
      const sa = .018 + Math.sin(tick * .003 + s * 2.1) * .008;
      gBloom.save();
      gBloom.globalAlpha = sa;
      const curtain = gBloom.createLinearGradient(sx - 40, hy - 80, sx + 40, hy + 20);
      curtain.addColorStop(0, s % 2 === 0 ? 'rgba(0,245,196,1)' : 'rgba(124,58,237,1)');
      curtain.addColorStop(1, 'rgba(0,0,0,0)');
      gBloom.strokeStyle = curtain; gBloom.lineWidth = 1.2;
      gBloom.beginPath(); gBloom.moveTo(sx, hy - 80); gBloom.lineTo(sx + (Math.sin(tick*.002+s)*18), hy + 20);
      gBloom.stroke();
      gBloom.restore();
    }

    // Bokeh
    BOKEH.forEach(bk => {
      bk.xf = (bk.xf + bk.sp + 1) % 1;
      const bx = bk.xf*W, by = bk.yf*H;
      const ba = .016 + Math.sin(tick*.005+bk.ph)*.008;
      const bg = gBloom.createRadialGradient(bx,by,0,bx,by,bk.r);
      bg.addColorStop(0, bk.warm ? `rgba(245,158,11,${ba})` : `rgba(0,212,255,${ba})`); bg.addColorStop(1,'rgba(0,0,0,0)');
      gBloom.fillStyle = bg; gBloom.beginPath(); gBloom.arc(bx,by,bk.r,0,Math.PI*2); gBloom.fill();
    });

    // Forge warmth bottom
    const fc = gBloom.createRadialGradient(W*.5,H,0,W*.5,H,W*.38);
    fc.addColorStop(0,'rgba(28,11,2,.38)'); fc.addColorStop(.42,'rgba(14,5,0,.16)'); fc.addColorStop(1,'rgba(0,0,0,0)');
    gBloom.fillStyle = fc; gBloom.fillRect(0,0,W,H);

    // Vignette
    const vig = gBloom.createRadialGradient(W*.5,H*.5,Math.min(W,H)*.27, W*.5,H*.5,Math.max(W,H)*.83);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,3,12,.52)');
    gBloom.fillStyle = vig; gBloom.fillRect(0,0,W,H);
  }

  // ════════════════════════════════════════════════════════════════════
  // ANIMATION LOOP
  // ════════════════════════════════════════════════════════════════════
  function frame() {
    tick++;
    if (tick - edgeAge > 720) { buildEdges(); edgeAge = tick; }
    drawStars(); drawNebulae();
    updateNetwork(); drawNetwork();
    updateParticles(); drawParticles();
    drawBloom();
    requestAnimationFrame(frame);
  }

  resize();
  frame();
})();
