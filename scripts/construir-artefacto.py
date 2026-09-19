#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ensambla el artefacto de 3DQRGenerator en un unico HTML autocontenido.

Parte de los archivos REALES de la web y aplica solo los cambios que el visor
de artefactos obliga a hacer:
  1. Las librerias se cargan desde el CDN permitido (jsdelivr), no desde lib/.
  2. three.js se importa por URL completa y OrbitControls se sustituye por unos
     controles propios con soporte tactil (no hay mapa de importaciones).
  3. Las descargas de archivos estan bloqueadas dentro del visor: en su lugar se
     genera el archivo igual y se informa del resultado con enlace a la web.
  4. Enlaces internos (legal, logo) apuntan a la web publicada.
  5. Tema claro/oscuro: se anaden los selectores data-theme del visor.
"""
import io
import os
import re

SRC = "D:/user kiro/Escritorio/INVERSIONES/PROGRAMAS IA/micro saas/qr3d/"
OUT = ("C:/Users/User/AppData/Local/Temp/claude/D--PROYECTO-ATLAS/"
       "c6dcd453-b15c-4130-af09-611861d1dc9b/scratchpad/artefacto-qr3d.html")
WEB = "https://qr3d-codigo-qr-para-imprimir.netlify.app"
THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js"


def leer(p):
    return io.open(SRC + p, encoding="utf-8").read()


def sustituir(texto, viejo, nuevo, etiqueta):
    if viejo not in texto:
        raise SystemExit("NO ENCONTRADO -> " + etiqueta)
    if texto.count(viejo) != 1:
        raise SystemExit("APARECE %d VECES -> %s" % (texto.count(viejo), etiqueta))
    return texto.replace(viejo, nuevo)


# ---------------------------------------------------------------- 1. CSS
css = leer("styles.css")

# El visor marca el tema con data-theme en la raiz; hay que respetarlo en los
# dos sentidos, sin perder el modo automatico del sistema.
bloque_oscuro = re.search(
    r"@media \(prefers-color-scheme: dark\) \{\n  :root \{\n(.*?)\n  \}\n\}\n",
    css, re.S)
if not bloque_oscuro:
    raise SystemExit("NO ENCONTRADO -> bloque de modo oscuro en styles.css")
tokens_oscuros = bloque_oscuro.group(1)

css = css.replace(bloque_oscuro.group(0),
                  "@media (prefers-color-scheme: dark) {\n"
                  '  :root:not([data-theme="light"]) {\n' + tokens_oscuros + "\n  }\n}\n"
                  '\n:root[data-theme="dark"] {\n' + tokens_oscuros + "\n}\n")

# (el color-scheme de cada tema ya viene en styles.css)

# El aviso de descarga del artefacto
css += """
/* ---------- Aviso propio del artefacto (las descargas van en la web) ---------- */
.dl-note {
  margin-top: .6rem; font-size: .84rem; line-height: 1.5;
  padding: .7rem .8rem; border-radius: var(--radius-sm);
  background: var(--info-bg); color: var(--info-ink);
  border: 1px solid color-mix(in srgb, var(--info-ink) 25%, transparent);
}
.dl-note a { text-decoration: underline; font-weight: 600; }
.demo-banner {
  /* texto corrido: en flex cada trozo se convierte en una linea suelta */
  display: block; text-align: center; text-wrap: pretty; line-height: 1.5;
  margin: 0 0 1rem; padding: .65rem 1rem; font-size: .84rem;
  border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
  border-radius: var(--radius); background: var(--accent-soft); color: var(--ink);
}
.demo-banner a { color: var(--accent); font-weight: 700; text-decoration: underline; }
"""

# ---------------------------------------------------------------- 2. HTML
html = leer("index.html")
cuerpo = re.search(r"<body>\n(.*?)\n<script defer", html, re.S).group(1)

# Los datos estructurados (JSON-LD) viven en el <head> del sitio; aqui van al
# final del cuerpo, que es igual de valido, para no perder nada de la pagina.
ldjson = re.findall(r'<script type="application/ld\+json">.*?</script>', html, re.S)
if len(ldjson) != 2:
    raise SystemExit("esperaba 2 bloques JSON-LD, encontrados %d" % len(ldjson))

# Enlaces que fuera de la web no llevan a ninguna parte
cuerpo = sustituir(cuerpo, '<a class="brand" href="/">',
                   '<a class="brand" href="%s" target="_blank" rel="noopener">' % WEB,
                   "enlace del logo")
cuerpo = sustituir(cuerpo, '<a href="privacidad.html">Privacidad</a>',
                   '<a href="%s/privacidad.html" target="_blank" rel="noopener">Privacidad</a>' % WEB,
                   "enlace de privacidad")
cuerpo = sustituir(cuerpo, '<a href="aviso-legal.html">Aviso legal</a>',
                   '<a href="%s/aviso-legal.html" target="_blank" rel="noopener">Aviso legal</a>' % WEB,
                   "enlace de aviso legal")

# Huecos donde se informa del archivo generado
cuerpo = sustituir(cuerpo,
                   '        <p class="privacy-badge">',
                   '        <p class="dl-note is-hidden" id="dl-note-2d"></p>\n\n'
                   '        <p class="privacy-badge">',
                   "hueco de aviso 2D")
cuerpo = sustituir(cuerpo,
                   '        <p class="field-hint">El 3MF se abre en Bambu Studio',
                   '        <p class="dl-note is-hidden" id="dl-note-3d"></p>\n'
                   '        <p class="field-hint">El 3MF se abre en Bambu Studio',
                   "hueco de aviso 3D")

# Aviso honesto de que esto es una copia para revisar
banner = ('  <div class="wrap">\n'
          '    <p class="demo-banner">Copia de la web para revisarla en el móvil. '
          'Funciona todo menos <b>guardar los archivos</b>, que el visor bloquea. '
          'Para descargar de verdad → '
          '<a href="%s" target="_blank" rel="noopener">la web publicada</a>.</p>\n'
          '  </div>\n\n' % WEB)
cuerpo = sustituir(cuerpo, '  <section class="wrap" id="herramienta"',
                   banner + '  <section class="wrap" id="herramienta"',
                   "banner de aviso")

# ---------------------------------------------------------------- 3. JS
manifest = leer("lib/manifest.js")
qr3d = leer("qr3d.js")
main = leer("main.js")

# --- three.js por URL completa (sin mapa de importaciones) ---
qr3d = sustituir(
    qr3d,
    '      Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")])\n'
    '        .then(function (mods) {\n'
    '          THREE = mods[0];',
    '      import("%s")\n'
    '        .then(function (mod) {\n'
    '          THREE = mod;' % THREE_URL,
    "carga de three.js")

# --- controles propios (OrbitControls no se puede resolver sin import map) ---
qr3d = sustituir(
    qr3d,
    '          controls = new mods[1].OrbitControls(camera, renderer.domElement);\n'
    '          controls.enableDamping = true;\n'
    '          controls.dampingFactor = 0.08;\n'
    '          controls.enablePan = false;\n'
    '          controls.rotateSpeed = 0.85;\n'
    '          controls.addEventListener("change", kick);',
    '          controls = crearOrbita(THREE, camera, renderer.domElement, kick);',
    "creacion de los controles")

qr3d = sustituir(
    qr3d,
    '        controls.target.set(0, 0, 0);\n        controls.update();',
    '        controls.target.set(0, 0, 0);\n        controls.sync();\n        controls.update();',
    "sincronizado de la camara")

orbita = '''
  /* Controles de orbita propios: arrastrar para girar, rueda o pellizco para
     acercar. Con Z arriba, como el resto del motor. Sustituyen a OrbitControls,
     que necesitaria un mapa de importaciones que aqui no existe. */
  function crearOrbita(THREE, camera, dom, onChange) {
    var target = new THREE.Vector3();
    var r = 100, theta = 0, phi = 1, r0 = 100;
    var dTheta = 0, dPhi = 0, dR = 0, sincronizar = true;
    var punteros = {}, distancia = 0;

    function sync() {
      var v = camera.position.clone().sub(target);
      r = Math.max(v.length(), 1e-3);
      r0 = r;
      theta = Math.atan2(v.y, v.x);
      phi = Math.acos(Math.max(-1, Math.min(1, v.z / r)));
      dTheta = dPhi = dR = 0;
      sincronizar = false;
    }

    function colocar() {
      var s = Math.sin(phi);
      camera.position.set(target.x + r * s * Math.cos(theta),
                          target.y + r * s * Math.sin(theta),
                          target.z + r * Math.cos(phi));
      camera.up.set(0, 0, 1);
      camera.lookAt(target);
    }

    function activos() { return Object.keys(punteros); }

    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", function (e) {
      punteros[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { dom.setPointerCapture(e.pointerId); } catch (_) {}
    });
    dom.addEventListener("pointermove", function (e) {
      var p = punteros[e.pointerId];
      if (!p) return;
      var ids = activos();
      if (ids.length >= 2) {                       // pellizco para acercar
        punteros[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = punteros[ids[0]], b = punteros[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distancia) dR += (distancia - d) * 0.9;
        distancia = d;
      } else {                                     // arrastrar para girar
        dTheta -= (e.clientX - p.x) * 0.0085;
        dPhi -= (e.clientY - p.y) * 0.0085;
        punteros[e.pointerId] = { x: e.clientX, y: e.clientY };
      }
      onChange();
    });
    function soltar(e) {
      delete punteros[e.pointerId];
      if (activos().length < 2) distancia = 0;
      try { dom.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    dom.addEventListener("pointerup", soltar);
    dom.addEventListener("pointercancel", soltar);
    dom.addEventListener("wheel", function (e) {
      e.preventDefault();
      dR += e.deltaY * 0.15;
      onChange();
    }, { passive: false });

    return {
      target: target,
      sync: sync,
      update: function () {
        if (sincronizar) sync();
        theta += dTheta; phi += dPhi; r += dR;
        dTheta *= 0.84; dPhi *= 0.84; dR *= 0.84;      // amortiguacion
        if (Math.abs(dTheta) < 1e-5) dTheta = 0;
        if (Math.abs(dPhi) < 1e-5) dPhi = 0;
        if (Math.abs(dR) < 1e-4) dR = 0;
        phi = Math.max(0.08, Math.min(Math.PI - 0.08, phi));
        r = Math.max(r0 * 0.35, Math.min(r0 * 2.6, r));
        colocar();
      },
      addEventListener: function () {}
    };
  }
'''
qr3d = sustituir(qr3d,
                 "  /* container: el div donde va el lienzo.",
                 orbita + "\n  /* container: el div donde va el lienzo.",
                 "insercion de los controles")

# --- descargas: el visor las bloquea, se informa del archivo generado ---
main = sustituir(
    main,
    '''  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
    /* el anuncio se dispara DESPUÉS: nunca puede bloquear la descarga */
    document.dispatchEvent(new CustomEvent("qr:downloaded", { detail: { name: name } }));
  }''',
    '''  var WEB = "%s";

  /* En la web esto guarda el archivo. Dentro del visor de artefactos las
     descargas estan bloqueadas, asi que el archivo se genera igual (para poder
     comprobar tamano y piezas) y se informa de ello con enlace a la web. */
  function saveBlob(blob, name) {
    var kb = (blob.size / 1024).toFixed(1).replace(".", ",");
    var el = $(/\\.(png|svg)$/i.test(name) ? "#dl-note-2d" : "#dl-note-3d");
    if (el) {
      el.textContent = "";
      var b = document.createElement("b");
      b.textContent = "Archivo generado: ";
      var n = document.createElement("span");
      n.textContent = name + " \\u00b7 " + kb + " KB. ";
      var t = document.createElement("span");
      t.textContent = "Aqui no se puede guardar: el visor bloquea las descargas. " +
        "Desc\\u00e1rgalo desde la web \\u2192 ";
      var a = document.createElement("a");
      a.href = WEB; a.target = "_blank"; a.rel = "noopener";
      a.textContent = WEB.replace("https://", "");
      el.appendChild(b); el.appendChild(n); el.appendChild(t); el.appendChild(a);
      el.classList.remove("is-hidden");
    }
    /* el anuncio se dispara DESPUES, igual que en la web */
    document.dispatchEvent(new CustomEvent("qr:downloaded", { detail: { name: name } }));
  }''' % WEB,
    "saveBlob del artefacto")

# ---------------------------------------------------------------- 4. Montaje
partes = []
partes.append("<title>3DQRGenerator</title>")
partes.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
partes.append('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
partes.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
              'family=Archivo:wght@400;500;600;700;800&display=swap">')
partes.append("<style>\n" + css + "\n</style>\n")
partes.append(cuerpo)
partes.append("\n" + "\n".join(ldjson))
partes.append('\n<script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.9.2/'
              'lib/qr-code-styling.js"></script>')
partes.append('<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>')
partes.append("<script>\n" + manifest + "\n" + qr3d + "\n" + main + "\n</script>")

doc = "\n".join(partes) + "\n"

# Comprobaciones de seguridad antes de escribir
assert "<!DOCTYPE" not in doc and "<html" not in doc and "<body" not in doc, "no debe llevar esqueleto"
assert 'type="module"' not in doc, "nada de script type=module"
assert "lib/vendor" not in doc, "quedan rutas locales de librerias"
assert "lib/manifest.js" not in doc, "queda una ruta local"
assert doc.count("</script>") == doc.count("<script"), "scripts descuadrados"

io.open(OUT, "w", encoding="utf-8", newline="\n").write(doc)
raw = io.open(OUT, "rb").read()
assert b"\x00" not in raw and raw[:3] != b"\xef\xbb\xbf"
print("OK %s" % OUT)
print("   %d KB  ·  %d lineas" % (len(raw) / 1024, doc.count("\n")))
