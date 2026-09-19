/* 3DQRGenerator — motor 3D: geometria, exportadores (3MF / STL) y vista previa.
   Global expuesto: window.__QR3D__
   Nada se ejecuta al cargar el archivo: solo define funciones. */
(function () {
  "use strict";

  var EPS = 1e-9;

  /* ============================================================
     1. Poligonos 2D (contornos)
     ============================================================ */

  function signedArea(ring) {
    var a = 0, n = ring.length;
    for (var i = 0; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;                       // > 0 = antihorario (CCW)
  }

  function orient(ring, ccw) {
    return (signedArea(ring) < 0) === !!ccw ? ring.slice().reverse() : ring.slice();
  }

  function near(p, q) {
    return Math.abs(p.x - q.x) < 1e-7 && Math.abs(p.y - q.y) < 1e-7;
  }

  function dedupeRing(ring) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (out.length && near(p, out[out.length - 1])) continue;
      out.push(p);
    }
    if (out.length > 1 && near(out[0], out[out.length - 1])) out.pop();
    return out;
  }

  /* Rectangulo con esquinas redondeadas, centrado en (cx, cy), CCW */
  function ringRoundedRect(cx, cy, w, h, r, seg) {
    seg = seg || 6;
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2 - 1e-6));
    var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    var out = [];
    var corners = [
      { x: x1 - r, y: y0 + r, a0: -Math.PI / 2 },
      { x: x1 - r, y: y1 - r, a0: 0 },
      { x: x0 + r, y: y1 - r, a0: Math.PI / 2 },
      { x: x0 + r, y: y0 + r, a0: Math.PI }
    ];
    for (var c = 0; c < 4; c++) {
      var k = corners[c];
      for (var i = 0; i <= seg; i++) {
        var a = k.a0 + (Math.PI / 2) * (i / seg);
        out.push({ x: k.x + r * Math.cos(a), y: k.y + r * Math.sin(a) });
      }
    }
    return dedupeRing(out);
  }

  function ringCircle(cx, cy, r, seg) {
    seg = seg || 36;
    var out = [];
    for (var i = 0; i < seg; i++) {
      var a = (2 * Math.PI * i) / seg;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return out;                          // CCW
  }

  /* ============================================================
     2. Triangulacion (ear clipping con puentes para agujeros)
     ============================================================ */

  function pointInTri(p, a, b, c) {
    if (near(p, a) || near(p, b) || near(p, c)) return false;
    var d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
    var d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
    var d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
    var neg = d1 < -EPS || d2 < -EPS || d3 < -EPS;
    var pos = d1 > EPS || d2 > EPS || d3 > EPS;
    return !(neg && pos);
  }

  function maxX(ring) {
    var m = -Infinity;
    for (var i = 0; i < ring.length; i++) if (ring[i].x > m) m = ring[i].x;
    return m;
  }

  /* Une un agujero al contorno con un puente y devuelve un poligono simple. */
  function bridgeHole(poly, hole) {
    var hi = 0, i;
    for (i = 1; i < hole.length; i++) if (hole[i].x > hole[hi].x) hi = i;
    var M = hole[hi];

    /* rayo horizontal +x desde M: arista mas cercana que corta */
    var best = null, bestX = Infinity, bestIdx = -1;
    for (var j = 0; j < poly.length; j++) {
      var a = poly[j], b = poly[(j + 1) % poly.length];
      if (a.y === b.y) continue;
      if (M.y >= Math.min(a.y, b.y) && M.y <= Math.max(a.y, b.y)) {
        var x = a.x + ((M.y - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (x >= M.x - 1e-9 && x < bestX) {
          bestX = x;
          if (a.x > b.x) { best = a; bestIdx = j; }
          else { best = b; bestIdx = (j + 1) % poly.length; }
        }
      }
    }
    if (bestIdx < 0) { bestIdx = 0; best = poly[0]; }

    /* refinamiento clasico: vertice visible con el angulo mas pequeno */
    var I = { x: bestX, y: M.y };
    var cand = best, candIdx = bestIdx, bestAng = Infinity;
    for (var k = 0; k < poly.length; k++) {
      var p = poly[k];
      if (p.x < M.x) continue;
      if (!near(p, best) && !pointInTri(p, M, I, best)) continue;
      var ang = Math.abs(p.y - M.y) / (Math.abs(p.x - M.x) + 1e-12);
      if (ang < bestAng) { bestAng = ang; cand = p; candIdx = k; }
    }

    var merged = poly.slice(0, candIdx + 1);
    for (var m = 0; m <= hole.length; m++) merged.push(hole[(hi + m) % hole.length]);
    merged.push({ x: cand.x, y: cand.y });
    return merged.concat(poly.slice(candIdx + 1));
  }

  function eliminateHoles(outer, holes) {
    var poly = outer.slice();
    var list = holes.slice().sort(function (a, b) { return maxX(b) - maxX(a); });
    for (var h = 0; h < list.length; h++) poly = bridgeHole(poly, list[h]);
    return poly;
  }

  /* Triangulos [[p0,p1,p2], ...] con puntos {x,y}, en sentido CCW */
  function triangulate(outer, holes) {
    var o = orient(outer, true);
    var hs = (holes || []).map(function (h) { return orient(h, false); });
    var poly = hs.length ? eliminateHoles(o, hs) : o;

    var idx = [], i;
    for (i = 0; i < poly.length; i++) idx.push(i);
    var tris = [], guard = poly.length * poly.length + 64;

    while (idx.length > 3 && guard-- > 0) {
      var clipped = false;
      for (i = 0; i < idx.length; i++) {
        var i0 = idx[(i - 1 + idx.length) % idx.length];
        var i1 = idx[i];
        var i2 = idx[(i + 1) % idx.length];
        var a = poly[i0], b = poly[i1], c = poly[i2];
        var cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (cross <= EPS) continue;                       // reflex o degenerado
        var ok = true;
        for (var k = 0; k < idx.length; k++) {
          var pk = idx[k];
          if (pk === i0 || pk === i1 || pk === i2) continue;
          if (pointInTri(poly[pk], a, b, c)) { ok = false; break; }
        }
        if (!ok) continue;
        tris.push([a, b, c]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3) tris.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]]);
    return tris;
  }

  /* ============================================================
     3. Malla (con soldadura de vertices)
     ============================================================ */

  function Mesh() {
    this.verts = [];      // [x, y, z, ...] en milimetros
    this.tris = [];       // [i, j, k, ...]
    this._map = Object.create(null);
  }

  Mesh.prototype.v = function (x, y, z) {
    var key = Math.round(x * 1000) + "|" + Math.round(y * 1000) + "|" + Math.round(z * 1000);
    var hit = this._map[key];
    if (hit !== undefined) return hit;
    var id = this.verts.length / 3;
    this.verts.push(x, y, z);
    this._map[key] = id;
    return id;
  };

  Mesh.prototype.tri = function (a, b, c) {
    if (a === b || b === c || a === c) return;             // degenerado
    this.tris.push(a, b, c);
  };

  Mesh.prototype.quad = function (a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  };

  Mesh.prototype.box = function (x0, y0, z0, x1, y1, z1) {
    var m = this;
    var a = m.v(x0, y0, z0), b = m.v(x1, y0, z0), c = m.v(x1, y1, z0), d = m.v(x0, y1, z0);
    var e = m.v(x0, y0, z1), f = m.v(x1, y0, z1), g = m.v(x1, y1, z1), h = m.v(x0, y1, z1);
    m.quad(a, d, c, b);   // abajo (-Z)
    m.quad(e, f, g, h);   // arriba (+Z)
    m.quad(a, b, f, e);   // -Y
    m.quad(b, c, g, f);   // +X
    m.quad(c, d, h, g);   // +Y
    m.quad(d, a, e, h);   // -X
    return this;
  };

  /* Prisma: extruye un contorno (con agujeros) entre z0 y z1 */
  Mesh.prototype.prism = function (outer, holes, z0, z1) {
    var m = this, i, j;
    var tris = triangulate(outer, holes);
    for (i = 0; i < tris.length; i++) {
      var t = tris[i];
      m.tri(m.v(t[0].x, t[0].y, z1), m.v(t[1].x, t[1].y, z1), m.v(t[2].x, t[2].y, z1));
      m.tri(m.v(t[2].x, t[2].y, z0), m.v(t[1].x, t[1].y, z0), m.v(t[0].x, t[0].y, z0));
    }
    var rings = [orient(outer, true)];
    (holes || []).forEach(function (h) { rings.push(orient(h, false)); });
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      for (j = 0; j < r.length; j++) {
        var p = r[j], q = r[(j + 1) % r.length];
        m.quad(m.v(p.x, p.y, z0), m.v(q.x, q.y, z0), m.v(q.x, q.y, z1), m.v(p.x, p.y, z1));
      }
    }
    return this;
  };

  /* Transformacion afin de todos los vertices (coloca la pieza en su sitio) */
  Mesh.prototype.transform = function (fn) {
    for (var i = 0; i < this.verts.length; i += 3) {
      var p = fn(this.verts[i], this.verts[i + 1], this.verts[i + 2]);
      this.verts[i] = p[0]; this.verts[i + 1] = p[1]; this.verts[i + 2] = p[2];
    }
    this._map = Object.create(null);       // las claves antiguas ya no valen
    return this;
  };

  Mesh.prototype.translate = function (dx, dy, dz) {
    return this.transform(function (x, y, z) { return [x + dx, y + dy, z + dz]; });
  };

  /* Rotacion alrededor del eje X (para inclinar la cara del soporte) */
  Mesh.prototype.rotateX = function (rad) {
    var s = Math.sin(rad), c = Math.cos(rad);
    return this.transform(function (x, y, z) { return [x, y * c - z * s, y * s + z * c]; });
  };

  Mesh.prototype.bounds = function () {
    var b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (var i = 0; i < this.verts.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        var v = this.verts[i + k];
        if (v < b.min[k]) b.min[k] = v;
        if (v > b.max[k]) b.max[k] = v;
      }
    }
    return b;
  };

  Mesh.prototype.triCount = function () { return this.tris.length / 3; };

  /* ============================================================
     4. Rasterizado: celdas encendidas -> rectangulos maximales
     ============================================================ */

  function gridRects(on, cols, rows) {
    var used = new Uint8Array(cols * rows), out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (used[r * cols + c] || !on(r, c)) continue;
        var w = 1;
        while (c + w < cols && !used[r * cols + c + w] && on(r, c + w)) w++;
        var h = 1;
        grow: while (r + h < rows) {
          for (var k = 0; k < w; k++) {
            if (used[(r + h) * cols + c + k] || !on(r + h, c + k)) break grow;
          }
          h++;
        }
        for (var rr = r; rr < r + h; rr++) {
          for (var cc = c; cc < c + w; cc++) used[rr * cols + cc] = 1;
        }
        out.push({ c: c, r: r, w: w, h: h });
      }
    }
    return out;
  }

  /* Convierte un mapa de bits (mascara) en cajas de relieve dentro de un
     rectangulo de destino en milimetros. bleed suelda las cajas entre si.
     opts.yDown: el marco tiene la Y hacia abajo (cara inclinada del soporte).
     opts.flipX: espeja horizontalmente (para que el codigo se lea bien). */
  function reliefBoxes(mesh, mask, dest, z0, z1, opts) {
    opts = opts || {};
    var bleed = (opts.bleed == null) ? 0.01 : opts.bleed;
    var rects = gridRects(mask.on, mask.cols, mask.rows);
    var sx = dest.w / mask.cols, sy = dest.h / mask.rows;
    for (var i = 0; i < rects.length; i++) {
      var q = rects[i], x0, x1, y0, y1;
      if (opts.flipX) {
        x0 = dest.x + (mask.cols - q.c - q.w) * sx - bleed;
        x1 = dest.x + (mask.cols - q.c) * sx + bleed;
      } else {
        x0 = dest.x + q.c * sx - bleed;
        x1 = dest.x + (q.c + q.w) * sx + bleed;
      }
      if (opts.yDown) {                 // la fila 0 va al minimo de Y
        y0 = dest.y + q.r * sy - bleed;
        y1 = dest.y + (q.r + q.h) * sy + bleed;
      } else {                          // la fila 0 va arriba del todo
        y1 = dest.y + dest.h - q.r * sy + bleed;
        y0 = dest.y + dest.h - (q.r + q.h) * sy - bleed;
      }
      mesh.box(x0, y0, z0, x1, y1, z1);
    }
    return rects.length;
  }

  /* Mascara a partir de pixeles: "alpha" (emojis, textos, logos con
     transparencia) o "luma" (fotos y el raster del QR en blanco y negro). */
  function maskFromPixels(px, w, h, mode, threshold) {
    var on = new Uint8Array(w * h);
    var t = (threshold == null) ? 128 : threshold;
    for (var i = 0, n = w * h; i < n; i++) {
      var o = i * 4;
      if (mode === "alpha") on[i] = px[o + 3] >= t ? 1 : 0;
      else {
        var a = px[o + 3] / 255;
        var lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) * a + 255 * (1 - a);
        on[i] = lum < t ? 1 : 0;
      }
    }
    return {
      cols: w, rows: h, bits: on,
      on: function (r, c) { return on[r * w + c] === 1; }
    };
  }

  /* Recorta los margenes vacios de una mascara (para centrar textos) */
  function trimMask(mask) {
    var r, c, minR = mask.rows, maxR = -1, minC = mask.cols, maxC = -1;
    for (r = 0; r < mask.rows; r++) {
      for (c = 0; c < mask.cols; c++) {
        if (!mask.on(r, c)) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    if (maxR < 0) return null;                       // mascara vacia
    var w = maxC - minC + 1, h = maxR - minR + 1;
    return {
      cols: w, rows: h,
      on: function (rr, cc) { return mask.on(rr + minR, cc + minC); }
    };
  }

  /* ============================================================
     5. Construccion del objeto imprimible
     ============================================================ */

  function layout(o) {
    var s = o.spec;
    /* el margen nunca puede ser menor que la zona de silencio del codigo:
       sin ella (4 modulos de color base alrededor) muchos moviles no leen */
    var margin = Math.max(s.marginMm, o.quietMm || 0);
    var textH = o.textMask ? s.textMm : 0;
    var gap = o.textMask ? Math.max(2, margin * 0.4) : 0;
    var holeBand = 0;
    if (o.format === "llavero") holeBand = s.ringOuterMm;
    if (o.format === "placa") holeBand = s.holeMm + 6;
    var faceW = o.qrMm + 2 * margin;
    var faceH = margin + textH + gap + o.qrMm + margin + holeBand;
    return {
      margin: margin, textH: textH, gap: gap, holeBand: holeBand,
      faceW: faceW, faceH: faceH,
      yText: margin,                                   // marco Y hacia arriba
      yQR: margin + textH + gap
    };
  }

  /* Rectangulo de destino del texto: conserva la proporcion y se centra */
  function textDest(mask, L, yBottom) {
    var th = L.textH;
    var tw = th * (mask.cols / mask.rows);
    var maxW = L.faceW - 2 * L.margin;
    if (tw > maxW) { tw = maxW; th = tw * (mask.rows / mask.cols); }
    return { x: -tw / 2, y: yBottom + (L.textH - th) / 2, w: tw, h: th };
  }

  /* Devuelve { base, code, info } con las dos piezas ya colocadas en mm. */
  function buildObject(o) {
    var s = o.spec, L = layout(o);
    var base = new Mesh(), code = new Mesh();
    var relief = o.reliefMm, sink = o.sinkMm == null ? 0.15 : o.sinkMm;
    var boxes = 0, cx = 0;               // el marco de la cara esta centrado en X

    /* La cara (QR + texto) se construye SIEMPRE igual: plano XY, Y hacia
       arriba, relieve saliendo en +Z. El soporte solo la inclina despues con
       un giro sobre el eje X, que nunca puede espejar el codigo. */
    var faceZ0, faceZ1;
    if (o.format === "soporte") {
      /* Cuna de mesa: fondo plano, trasera vertical, cara inclinada mirando
         hacia delante y hacia arriba -> se imprime SIN soportes.
         Frente en y = 0, trasera en y = D. */
      var th = (s.slopeDeg * Math.PI) / 180;
      var hLip = s.lipMm;
      var D = L.faceH * Math.cos(th);
      var H = hLip + L.faceH * Math.sin(th);
      var sec = [                        // seccion en (y, z) del mundo
        { x: 0, y: 0 },                  // frente abajo
        { x: D, y: 0 },                  // trasera abajo
        { x: D, y: H },                  // trasera arriba
        { x: 0, y: hLip }                // labio frontal (no acaba en filo)
      ];
      base.prism(sec, [], -L.faceW / 2, L.faceW / 2);
      /* permutacion ciclica (x,y,z) -> (z,x,y): determinante +1, no espeja */
      base.transform(function (x, y, z) { return [z, x, y]; });
      faceZ0 = -sink; faceZ1 = relief;
    } else {
      var thick = s.plateThickMm;
      var rad = Math.min(Math.min(L.faceW, L.faceH) * 0.10, 6);
      var outer = ringRoundedRect(0, L.faceH / 2, L.faceW, L.faceH, rad, 8);
      var holes = [];
      if (o.format === "llavero") {
        holes.push(ringCircle(0, L.faceH - s.ringOuterMm / 2, s.ringHoleMm / 2, 36));
      } else {
        var inset = Math.max(L.margin + s.holeMm, L.faceW * 0.14);
        var hy = L.faceH - (s.holeMm + 6) / 2;
        holes.push(ringCircle(-L.faceW / 2 + inset, hy, s.holeMm / 2, 36));
        holes.push(ringCircle(L.faceW / 2 - inset, hy, s.holeMm / 2, 36));
      }
      base.prism(outer, holes, 0, thick);
      faceZ0 = thick - sink; faceZ1 = thick + relief;
    }

    boxes += reliefBoxes(code, o.qrMask,
      { x: cx - o.qrMm / 2, y: L.yQR, w: o.qrMm, h: o.qrMm }, faceZ0, faceZ1, {});

    if (o.textMask) {
      var dt = textDest(o.textMask, L, L.yText);
      boxes += reliefBoxes(code, o.textMask,
        { x: dt.x, y: dt.y, w: dt.w, h: dt.h }, faceZ0, faceZ1, {});
    }

    if (o.format === "soporte") {
      /* inclina SOLO el relieve y lo apoya en el borde del labio frontal:
         un giro sobre X nunca puede espejar el codigo */
      var ang = (s.slopeDeg * Math.PI) / 180;
      code.rotateX(ang);
      code.translate(0, 0, s.lipMm);
    }

    /* Todo al octante positivo: los laminadores colocan la pieza desde el origen */
    var b1 = base.bounds(), b2 = code.bounds();
    var mn = [Math.min(b1.min[0], b2.min[0]), Math.min(b1.min[1], b2.min[1]),
              Math.min(b1.min[2], b2.min[2])];
    base.translate(-mn[0], -mn[1], -mn[2]);
    code.translate(-mn[0], -mn[1], -mn[2]);

    var bb = base.bounds(), cb = code.bounds();
    return {
      base: base, code: code,
      info: {
        widthMm: Math.max(bb.max[0], cb.max[0]),
        depthMm: Math.max(bb.max[1], cb.max[1]),
        heightMm: Math.max(bb.max[2], cb.max[2]),
        faceW: L.faceW, faceH: L.faceH,
        boxes: boxes,
        tris: base.triCount() + code.triCount()
      }
    };
  }

  /* ============================================================
     6. Exportadores
     ============================================================ */

  function num(v) {
    var r = Math.round(v * 10000) / 10000;
    return (r === 0 ? 0 : r).toString();
  }

  function meshXML(mesh) {
    var out = ["<mesh><vertices>"], i;
    var v = mesh.verts;
    for (i = 0; i < v.length; i += 3) {
      out.push('<vertex x="' + num(v[i]) + '" y="' + num(v[i + 1]) + '" z="' + num(v[i + 2]) + '"/>');
    }
    out.push("</vertices><triangles>");
    var t = mesh.tris;
    for (i = 0; i < t.length; i += 3) {
      out.push('<triangle v1="' + t[i] + '" v2="' + t[i + 1] + '" v3="' + t[i + 2] + '"/>');
    }
    out.push("</triangles></mesh>");
    return out.join("");
  }

  function hex8(hex) {
    var h = String(hex || "#000000").replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) h = "000000";
    return "#" + h.toUpperCase() + "FF";        // el byte alfa NO es opcional
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    "</Types>";

  var RELS =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"' +
    ' Target="/3D/3dmodel.model"/>' +
    "</Relationships>";

  function modelXML(built, colorBase, colorCode, title) {
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<model unit="millimeter" xml:lang="es-ES"' +
      ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
      '<metadata name="Title">' + esc(title || "3DQRGenerator") + "</metadata>" +
      '<metadata name="Application">3DQRGenerator - Kiro Inversiones</metadata>' +
      "<resources>" +
      '<basematerials id="1">' +
      '<base name="Base" displaycolor="' + hex8(colorBase) + '"/>' +
      '<base name="Codigo" displaycolor="' + hex8(colorCode) + '"/>' +
      "</basematerials>" +
      '<object id="2" type="model" pid="1" pindex="0" name="Base">' + meshXML(built.base) + "</object>" +
      '<object id="3" type="model" pid="1" pindex="1" name="Codigo">' + meshXML(built.code) + "</object>" +
      "</resources>" +
      '<build><item objectid="2"/><item objectid="3"/></build>' +
      "</model>";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function to3MF(built, colorBase, colorCode, title) {
    if (typeof JSZip === "undefined") return Promise.reject(new Error("JSZip no disponible"));
    var zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", RELS);
    zip.file("3D/3dmodel.model", modelXML(built, colorBase, colorCode, title));
    return zip.generateAsync({ type: "blob", mimeType: "model/3mf", compression: "DEFLATE" });
  }

  /* STL binario (una pieza, sin color: opcion secundaria) */
  function toSTL(mesh, name) {
    var n = mesh.triCount();
    var buf = new ArrayBuffer(84 + n * 50);
    var dv = new DataView(buf);
    var header = "3DQRGenerator " + (name || "") + " - milimetros";
    for (var i = 0; i < 80; i++) dv.setUint8(i, i < header.length ? header.charCodeAt(i) & 0x7f : 32);
    dv.setUint32(80, n, true);
    var off = 84, v = mesh.verts, t = mesh.tris;
    for (var k = 0; k < t.length; k += 3) {
      var a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      var ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      var wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      dv.setFloat32(off, nx / len, true); dv.setFloat32(off + 4, ny / len, true);
      dv.setFloat32(off + 8, nz / len, true);
      off += 12;
      [a, b, c].forEach(function (p) {
        dv.setFloat32(off, v[p], true);
        dv.setFloat32(off + 4, v[p + 1], true);
        dv.setFloat32(off + 8, v[p + 2], true);
        off += 12;
      });
      dv.setUint16(off, 0, true);
      off += 2;
    }
    return buf;
  }

  var LEEME =
    "3DQRGenerator - impresion en dos colores\r\n" +
    "========================================\r\n\r\n" +
    "Este ZIP contiene dos archivos STL:\r\n" +
    "  base.stl    -> la pieza de fondo\r\n" +
    "  codigo.stl  -> el codigo QR y el texto en relieve\r\n\r\n" +
    "Como usarlos:\r\n" +
    "1. Importa LOS DOS archivos en tu laminador.\r\n" +
    "2. Colocalos en la posicion 0,0 (no los muevas): ya vienen alineados.\r\n" +
    "3. Selecciona ambos y agrupalos como un solo objeto de varias piezas.\r\n" +
    "4. Asigna un filamento a cada pieza: claro para la base, oscuro para el codigo.\r\n\r\n" +
    "Si tu impresora es moderna, usa mejor el archivo .3MF: lleva los colores\r\n" +
    "dentro y no hay que alinear nada. Lo genero 3DQRGenerator, de Kiro Inversiones.\r\n";

  function toSTLZip(built) {
    if (typeof JSZip === "undefined") return Promise.reject(new Error("JSZip no disponible"));
    var zip = new JSZip();
    zip.file("base.stl", toSTL(built.base, "base"));
    zip.file("codigo.stl", toSTL(built.code, "codigo"));
    zip.file("LEEME.txt", LEEME);
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  /* ============================================================
     7. Vista previa 3D (three.js, carga perezosa)
     ============================================================ */

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  }

  /* container: el div donde va el lienzo. onStatus(estado, detalle) informa a la UI.
     Estados: "espera" | "cargando" | "listo" | "sin-webgl" | "error" */
  function createViewer(container, onStatus) {
    var THREE = null, renderer = null, scene = null, camera = null, controls = null;
    var group = null, matBase = null, matCode = null;
    var status = "espera", visible = false, started = false, raf = 0;
    var pending = null, retry = 0, fitted = false;

    function say(s, d) { status = s; try { onStatus && onStatus(s, d); } catch (e) {} }

    function loop() {
      raf = 0;
      if (!renderer || !visible || document.hidden) return;      // no gastar bateria
      if (controls) controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    /* Siempre se cancela el frame anterior antes de pedir otro: si el navegador
       deja de llamar a loop() (pestana en segundo plano, animacion frenada),
       `raf` se queda con un numero viejo y un `if (!raf)` bloquearia el visor
       para siempre. Cancelar y volver a pedir garantiza que despierta. */
    function kick() {
      if (!renderer || !visible || document.hidden) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }

    function resize() {
      if (!renderer) return;
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;                                       // pestana en segundo plano
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      kick();
    }

    function start() {
      if (started) return;
      /* Trampa verificada: en una pestana que aun no se ha mostrado, la
         ventana mide 0 y el observador puede no dispararse nunca. */
      if (!window.innerHeight || !container.clientWidth) {
        if (retry++ < 60) setTimeout(start, 250);
        return;
      }
      started = true;
      if (!hasWebGL()) { say("sin-webgl"); return; }
      say("cargando");
      Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")])
        .then(function (mods) {
          THREE = mods[0];
          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
          camera.up.set(0, 0, 1);                                 // Z arriba, como en el laminador
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          container.appendChild(renderer.domElement);

          scene.add(new THREE.HemisphereLight(0xffffff, 0x9098a8, 2.1));
          var key = new THREE.DirectionalLight(0xffffff, 2.0);
          key.position.set(-0.6, -1, 1.2);
          scene.add(key);
          var fill = new THREE.DirectionalLight(0xffffff, 0.8);
          fill.position.set(1, 0.4, 0.5);
          scene.add(fill);

          matBase = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.72, metalness: 0.02 });
          matCode = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.6, metalness: 0.02 });
          group = new THREE.Group();
          scene.add(group);

          controls = new mods[1].OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.08;
          controls.enablePan = false;
          controls.rotateSpeed = 0.85;
          controls.addEventListener("change", kick);

          if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
          else window.addEventListener("resize", resize);

          say("listo");
          resize();
          if (pending) { apply(pending); pending = null; }
        })
        .catch(function (e) {
          console.warn("[3D] motor 3D:", e);
          say("error", e && e.message);
        });
    }

    function geomFrom(mesh) {
      /* sin indices: cada triangulo con sus propios vertices -> caras planas */
      var n = mesh.triCount(), pos = new Float32Array(n * 9), v = mesh.verts, t = mesh.tris;
      for (var i = 0, o = 0; i < t.length; i++, o += 3) {
        var p = t[i] * 3;
        pos[o] = v[p]; pos[o + 1] = v[p + 1]; pos[o + 2] = v[p + 2];
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    }

    function apply(job) {
      if (!renderer) { pending = job; return; }
      while (group.children.length) {
        var old = group.children.pop();
        if (old.geometry) old.geometry.dispose();
      }
      matBase.color.set(job.colorBase);
      matCode.color.set(job.colorCode);

      var gb = geomFrom(job.built.base), gc = geomFrom(job.built.code);
      var i = job.built.info;
      var cx = i.widthMm / 2, cy = i.depthMm / 2, cz = i.heightMm / 2;
      gb.translate(-cx, -cy, -cz);
      gc.translate(-cx, -cy, -cz);
      group.add(new THREE.Mesh(gb, matBase));
      group.add(new THREE.Mesh(gc, matCode));
      /* las piezas planas se giran para verlas de frente, no de canto */
      group.rotation.set(job.format === "soporte" ? 0 : Math.PI / 2, 0, 0);

      /* La primera vez SIEMPRE hay que encuadrar: mientras el motor cargaba,
         el trabajo pendiente pudo quedar marcado como "sin reencuadre" y la
         cámara se habría quedado en el origen, con la vista en blanco. */
      if (job.refit || !fitted) {
        fitted = true;
        var r = Math.max(i.widthMm, i.depthMm, i.heightMm);
        var d = (r / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.7;
        /* la cuna se enseña en tres cuartos (se ve que es un soporte);
           las piezas planas, casi de frente (el codigo se lee) */
        if (job.format === "soporte") camera.position.set(d * 0.55, -d * 0.72, d * 0.42);
        else camera.position.set(d * 0.2, -d * 0.92, d * 0.3);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
      }
      resize();
      kick();
    }

    /* arranque perezoso: solo cuando el visor se ve de verdad */
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          visible = entries[i].isIntersecting;
          if (visible) { start(); kick(); }
        }
      }, { rootMargin: "200px", threshold: 0.01 });
      io.observe(container);
    } else {
      visible = true;
      setTimeout(start, 400);
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { start(); resize(); kick(); }
    });

    return {
      update: function (built, colorBase, colorCode, format, refit) {
        var job = { built: built, colorBase: colorBase, colorCode: colorCode,
                    format: format, refit: refit };
        if (renderer) apply(job); else pending = job;
      },
      status: function () { return status; },
      wake: function () { start(); },
      /* fuerza un fotograma: permite comprobar el visor sin depender de que el
         navegador llegue a ejecutar requestAnimationFrame */
      paso: function () {
        if (!renderer) return false;
        if (controls) controls.update();
        renderer.render(scene, camera);
        return true;
      },
      /* sonda interna para las comprobaciones automaticas */
      debug: function () {
        return { estado: status, visible: visible, arrancado: started, raf: raf,
                 encuadrado: fitted, piezas: group ? group.children.length : -1,
                 camara: camera ? camera.position.toArray().map(function (v) {
                   return Math.round(v * 10) / 10; }) : null,
                 pendiente: !!pending,
                 lienzo: renderer ? [renderer.domElement.width, renderer.domElement.height] : null };
      }
    };
  }

  window.__QR3D__ = {
    hasWebGL: hasWebGL,
    createViewer: createViewer,
    signedArea: signedArea,
    orient: orient,
    ringRoundedRect: ringRoundedRect,
    ringCircle: ringCircle,
    triangulate: triangulate,
    gridRects: gridRects,
    reliefBoxes: reliefBoxes,
    maskFromPixels: maskFromPixels,
    trimMask: trimMask,
    layout: layout,
    buildObject: buildObject,
    modelXML: modelXML,
    to3MF: to3MF,
    toSTL: toSTL,
    toSTLZip: toSTLZip,
    Mesh: Mesh
  };
})();
