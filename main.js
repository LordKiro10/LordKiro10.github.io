/* 3DQRGenerator — interfaz: diseño del código, objeto 3D, descargas y anuncios.
   Scripts clásicos + IIFE. El motor 3D (three.js) se carga solo al verse. */
(function () {
  "use strict";

  var BRAND = window.__BRAND__ || {};
  var G = window.__QR3D__ || {};

  var $ = function (s, sc) { return (sc || document).querySelector(s); };
  var $$ = function (s, sc) { return Array.prototype.slice.call((sc || document).querySelectorAll(s)); };
  function safe(fn, name) { try { return fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  var state = {
    mode: "link",
    url: "https://ejemplo.com/mi-carta",
    ssid: "", pass: "", sec: "WPA",
    style: "clasico",
    colCode: "#0f172a",
    colBase: "#f6f8fc",
    center: { type: "none", key: null, url: null },   // "none" | "emoji" | "logo"
    format: "soporte",
    sizeMm: 60,
    text: "",
    textEmoji: "",
    relief: 1.2
  };

  var qr = null;                 // instancia visible de QRCodeStyling
  var modules = 0;               // número de módulos del código (n x n)
  var silhouetteURL = null;      // silueta en negro para el relieve
  var built = null;              // último objeto 3D construido
  var viewer = null;
  var gen = 0;                   // contador de generación (evita carreras)
  var lastFormat = null;

  /* ============================================================
     Utilidades
     ============================================================ */

  function payload() {
    if (state.mode === "wifi") {
      var esc = function (s) { return String(s || "").replace(/([\\;,:"])/g, "\\$1"); };
      if (state.sec === "nopass") return "WIFI:T:nopass;S:" + esc(state.ssid) + ";;";
      return "WIFI:T:" + state.sec + ";S:" + esc(state.ssid) + ";P:" + esc(state.pass) + ";;";
    }
    var v = String(state.url || "").trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) v = "https://" + v;
    return v;
  }

  function slug() {
    var p = payload();
    if (state.mode === "wifi") return "wifi-" + (state.ssid || "red").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      var h = new URL(p).hostname.replace(/^www\./, "");
      return h.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    } catch (e) {
      return (p || "codigo").slice(0, 24).replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "codigo";
    }
  }

  function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function luminance(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g2 = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * srgb(r) + 0.7152 * srgb(g2) + 0.0722 * srgb(b);
  }
  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function mmText(v) { return (Math.round(v * 10) / 10).toString().replace(".", ",") + " mm"; }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error("imagen no válida")); };
      i.src = src;
    });
  }

  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
    /* el anuncio se dispara DESPUÉS: nunca puede bloquear la descarga */
    document.dispatchEvent(new CustomEvent("qr:downloaded", { detail: { name: name } }));
  }

  /* ============================================================
     Centro del código: emoji y logo -> imagen + silueta
     ============================================================ */

  function emojiURL(emoji, size) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var x = c.getContext("2d");
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = Math.round(size * 0.8) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    x.fillText(emoji, size / 2, size / 2 + size * 0.05);
    return c.toDataURL("image/png");
  }

  /* Silueta en un solo color: alfa si la imagen tiene transparencia real,
     luminancia si es una foto. El relieve se imprime en un color. */
  function makeSilhouette(src) {
    return loadImage(src).then(function (img) {
      var S = 256;
      var c = document.createElement("canvas");
      c.width = c.height = S;
      var x = c.getContext("2d");
      var r = Math.min(S / img.width, S / img.height);
      var w = img.width * r, h = img.height * r;
      x.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      var d = x.getImageData(0, 0, S, S), px = d.data;
      var transparent = 0, i;
      for (i = 3; i < px.length; i += 4) if (px[i] < 200) transparent++;
      var useAlpha = transparent / (S * S) > 0.04;
      for (i = 0; i < px.length; i += 4) {
        var on;
        if (useAlpha) on = px[i + 3] >= 128;
        else {
          var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          on = lum < 140 && px[i + 3] > 40;
        }
        px[i] = px[i + 1] = px[i + 2] = 0;
        px[i + 3] = on ? 255 : 0;
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL("image/png");
    });
  }

  /* key identifica la elección (el emoji elegido o "logo");
     url es SIEMPRE una imagen utilizable (data URL), nunca el carácter suelto. */
  function setCenter(type, key, url) {
    if (type === "emoji") url = emojiURL(key, 256);
    state.center = { type: type, key: key || null, url: url || null };
    silhouetteURL = null;
    var clear = $("#btn-clear-center");
    if (clear) clear.classList.toggle("is-hidden", type === "none");
    $$("#emojis .emoji").forEach(function (b) {
      b.classList.toggle("is-active", type === "emoji" && b.dataset.emoji === key);
    });
    var p = state.center.url ? makeSilhouette(state.center.url) : Promise.resolve(null);
    return p.then(function (s) { silhouetteURL = s; })
            .catch(function () { silhouetteURL = null; });
  }

  /* ============================================================
     El código en 2D
     ============================================================ */

  function qrOptions(size, type, forMask) {
    var S = BRAND.styles[state.style] || BRAND.styles.clasico;
    var hasCenter = state.center.type !== "none" && !!state.center.url;
    var code = forMask ? "#000000" : state.colCode;
    var bg = forMask ? "#ffffff" : state.colBase;
    var img = forMask ? silhouetteURL : (state.center.url || null);
    var o = {
      width: size, height: size, type: type || "canvas",
      data: payload() || "https://",
      margin: forMask ? 0 : Math.round(size * 0.055),
      qrOptions: { errorCorrectionLevel: hasCenter ? "H" : "M" },
      imageOptions: { crossOrigin: "anonymous", margin: 0, imageSize: 0.36, hideBackgroundDots: true },
      dotsOptions: { color: code, type: S.dots },
      backgroundOptions: { color: bg },
      cornersSquareOptions: { color: code, type: S.corners },
      cornersDotOptions: { color: code, type: S.cornerDot }
    };
    if (hasCenter && img) o.image = img;
    return o;
  }

  function render2D() {
    var holder = $("#qr-holder");
    if (!holder || typeof QRCodeStyling === "undefined") return;
    var opts = qrOptions(320, "canvas", false);
    if (!qr) {
      qr = new QRCodeStyling(opts);
      qr.append(holder);
    } else {
      qr.update(opts);
    }
    modules = (qr._qr && qr._qr.getModuleCount) ? qr._qr.getModuleCount() : 0;
    var meta = $("#qr-meta");
    if (meta) {
      meta.textContent = modules
        ? "Código de " + modules + " × " + modules + " cuadraditos · corrección de errores " +
          (state.center.type !== "none" ? "alta" : "media")
        : "Escribe un enlace para generar tu código";
    }
  }

  /* ============================================================
     Máscaras para el relieve
     ============================================================ */

  /* El relieve se construye con el MISMO código estilizado que se ve en
     pantalla, rasterizado en blanco y negro: lo impreso coincide con lo visto. */
  function buildQrMask() {
    if (!modules || typeof QRCodeStyling === "undefined") return Promise.resolve(null);
    var px = 12, size = modules * px;
    var inst = new QRCodeStyling(qrOptions(size, "canvas", true));
    return inst.getRawData("png").then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      var x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      var d = x.getImageData(0, 0, c.width, c.height);
      return G.maskFromPixels(d.data, c.width, c.height, "luma", 128);
    });
  }

  function buildTextMask() {
    var label = ((state.textEmoji ? state.textEmoji + " " : "") + (state.text || "")).trim();
    if (!label) return null;
    var h = 56, pad = 10;
    var c = document.createElement("canvas");
    var x = c.getContext("2d", { willReadFrequently: true });
    var font = "700 " + h + "px 'Space Grotesk', Inter, system-ui, sans-serif";
    x.font = font;
    var w = Math.ceil(x.measureText(label).width);
    c.width = Math.max(16, w + pad * 2);
    c.height = h + pad * 2;
    x = c.getContext("2d", { willReadFrequently: true });
    x.font = font;
    x.textBaseline = "middle";
    x.fillStyle = "#000";
    x.fillText(label, pad, c.height / 2);
    var d = x.getImageData(0, 0, c.width, c.height);
    /* alfa: así los emojis de colores claros también salen en relieve */
    return G.trimMask(G.maskFromPixels(d.data, c.width, c.height, "alpha", 96));
  }

  /* ============================================================
     El objeto 3D
     ============================================================ */

  function rebuild3D() {
    var my = ++gen;
    return buildQrMask().then(function (mask) {
      if (my !== gen) return;                         // llegó otra versión más nueva
      if (!mask) { built = null; return; }
      var spec = BRAND.formats[state.format];
      var b = G.buildObject({
        format: state.format,
        spec: spec,
        qrMm: state.sizeMm,
        reliefMm: state.relief,
        sinkMm: BRAND.print.sinkMm,
        quietMm: BRAND.print.quietModules * (state.sizeMm / modules),
        qrMask: mask,
        textMask: buildTextMask()
      });
      if (my !== gen) return;
      built = b;
      paintSpecs(b);
      if (viewer) {
        viewer.update(b, state.colBase, state.colCode, state.format, lastFormat !== state.format);
        lastFormat = state.format;
      }
    }).catch(function (e) {
      console.warn("[rebuild3D]", e);
    });
  }

  function paintSpecs(b) {
    var mm = state.sizeMm / modules;
    var t = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    t("#spec-size", Math.round(b.info.widthMm) + " × " + Math.round(b.info.depthMm) +
      " × " + Math.round(b.info.heightMm) + " mm");
    t("#spec-module", mmText(mm));
    t("#spec-relief", mmText(state.relief));
    t("#spec-colors", "2 piezas · 2 colores");

    var box = $("#warnings");
    if (!box) return;
    var out = [];
    var ratio = contrast(state.colCode, state.colBase);
    if (ratio < BRAND.print.minContrast) {
      out.push(["mal", "Estos dos colores no tienen suficiente contraste (" +
        (Math.round(ratio * 10) / 10).toString().replace(".", ",") +
        ":1) y el código no se escaneará. Usa una base clara y un código oscuro."]);
    } else if (luminance(state.colCode) > luminance(state.colBase)) {
      out.push(["ojo", "Has puesto el código más claro que la base. La mayoría de móviles lo leen, " +
        "pero algunos antiguos no. Si es para un negocio, mejor al revés."]);
    }
    if (mm < BRAND.print.minModuleMm) {
      out.push(["mal", "Cada cuadradito mide " + mmText(mm) + " y la impresora necesita al menos " +
        mmText(BRAND.print.minModuleMm) + ". Agranda el objeto o acorta el enlace."]);
    } else if (mm < BRAND.print.minModuleMm * 1.2) {
      out.push(["ojo", "Cada cuadradito mide " + mmText(mm) + ", justo en el límite. " +
        "Haz una prueba de escaneo antes de imprimir muchas piezas."]);
    }
    if (state.center.type !== "none") {
      out.push(["info", "El centro tapa parte del código. Ya usamos la corrección de errores más alta, " +
        "pero prueba a escanear la pieza antes de imprimir una tirada."]);
    }
    /* Si no hay ningún reparo, se dice en verde: es el color que en el sistema
       de Kiro Inversiones significa «validado», y da la señal de que se puede
       mandar a imprimir sin mirar nada más. */
    if (!out.length) {
      out.push(["ok", "✓ Todo correcto: contraste " +
        (Math.round(ratio * 10) / 10).toString().replace(".", ",") +
        ":1 y cuadraditos de " + mmText(mm) + ". Listo para imprimir."]);
    }
    box.innerHTML = out.map(function (w) {
      return '<p class="warn warn-' + w[0] + '">' + w[1] + "</p>";
    }).join("");
  }

  /* ============================================================
     Descargas
     ============================================================ */

  function downloadImage(kind) {
    var size = kind === "png" ? parseInt($("#in-png-size").value, 10) || 1024 : 1024;
    var inst = new QRCodeStyling(qrOptions(size, kind === "svg" ? "svg" : "canvas", false));
    return inst.getRawData(kind).then(function (blob) {
      saveBlob(blob, "qr-" + slug() + "." + kind);
    });
  }

  function ensureBuilt() {
    return built ? Promise.resolve(built) : rebuild3D().then(function () { return built; });
  }

  function download3MF() {
    return ensureBuilt().then(function (b) {
      if (!b) throw new Error("sin objeto");
      return G.to3MF(b, state.colBase, state.colCode, "3DQRGenerator " + slug());
    }).then(function (blob) {
      saveBlob(blob, "3dqr-" + state.format + "-" + slug() + ".3mf");
    });
  }

  function downloadSTL() {
    return ensureBuilt().then(function (b) {
      if (!b) throw new Error("sin objeto");
      return G.toSTLZip(b);
    }).then(function (blob) {
      saveBlob(blob, "3dqr-" + state.format + "-" + slug() + "-stl.zip");
    });
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle("is-busy", !!on);
    if (on) { btn.dataset.prev = btn.textContent; btn.textContent = label; }
    else if (btn.dataset.prev) { btn.textContent = btn.dataset.prev; delete btn.dataset.prev; }
  }

  /* ============================================================
     Huecos de anuncio (solo placeholders, sin scripts de terceros)
     ============================================================ */

  var lastAd = 0;
  function initAds() {
    var modal = $("#ad-modal");
    var close = function () { try { modal.close(); } catch (e) { modal.removeAttribute("open"); } };
    if (modal) {
      document.addEventListener("qr:downloaded", function () {
        var now = Date.now();
        if (now - lastAd < 20000) return;              // no molestar en cada clic
        lastAd = now;
        setTimeout(function () {
          try { if (!modal.open) modal.showModal(); } catch (e) {}
        }, 350);                                       // la descarga ya ha empezado
      });
      $("#ad-modal-close").addEventListener("click", close);
      $("#ad-modal-continue").addEventListener("click", close);
      modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    }
    var toast = $("#ad-toast");
    var off = false;
    try { off = sessionStorage.getItem("3dqr-toast") === "off"; } catch (e) {}
    if (toast && !off) {
      /* Solo aparece cuando el usuario ya no está sobre la herramienta: así
         nunca tapa los botones de descarga. */
      var waited = false, away = false;
      var maybe = function () {
        if (waited && away) toast.classList.remove("is-hidden");
        else toast.classList.add("is-hidden");
      };
      setTimeout(function () { waited = true; maybe(); }, 12000);
      var card = $(".tool-card");
      if (card && "IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          away = !es[0].isIntersecting;
          maybe();
        }, { threshold: 0.02 }).observe(card);
      } else {
        away = true;
      }
      $("#ad-toast-close").addEventListener("click", function () {
        toast.classList.add("is-hidden");
        waited = false;
        try { sessionStorage.setItem("3dqr-toast", "off"); } catch (e) {}
      });
    }
  }

  /* ============================================================
     Controles
     ============================================================ */

  var timer = 0;
  function refresh(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      safe(render2D, "render2D");
      rebuild3D();
    }, delay == null ? 140 : delay);
  }

  function initControls() {
    $$(".tab").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mode = b.dataset.mode;
        $$(".tab").forEach(function (t) {
          var on = t === b;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        $$("[data-pane]").forEach(function (p) {
          p.classList.toggle("is-hidden", p.dataset.pane !== state.mode);
        });
        refresh(0);
      });
    });

    var bind = function (sel, key, ev) {
      var el = $(sel);
      if (!el) return;
      el.addEventListener(ev || "input", function () {
        state[key] = el.value;
        refresh();
      });
    };
    bind("#in-url", "url");
    bind("#in-ssid", "ssid");
    bind("#in-pass", "pass");
    bind("#in-sec", "sec", "change");
    bind("#in-text", "text");

    $$("#styles .chip").forEach(function (b) {
      b.addEventListener("click", function () {
        state.style = b.dataset.style;
        $$("#styles .chip").forEach(function (c) { c.classList.toggle("is-active", c === b); });
        refresh(0);
      });
    });

    ["#in-col-code", "#in-col-base"].forEach(function (sel) {
      var el = $(sel);
      el.addEventListener("input", function () {
        if (sel === "#in-col-code") state.colCode = el.value; else state.colBase = el.value;
        refresh(60);
      });
    });
    $("#btn-swap").addEventListener("click", function () {
      var a = state.colCode;
      state.colCode = state.colBase;
      state.colBase = a;
      $("#in-col-code").value = state.colCode;
      $("#in-col-base").value = state.colBase;
      refresh(0);
    });

    $$("#emojis .emoji").forEach(function (b) {
      b.addEventListener("click", function () {
        var e = b.dataset.emoji;
        /* volver a pulsar el emoji ya elegido lo quita */
        var yaEsta = state.center.type === "emoji" && state.center.key === e;
        setCenter(yaEsta ? "none" : "emoji", yaEsta ? null : e)
          .then(function () { refresh(0); });
      });
    });
    $("#btn-clear-center").addEventListener("click", function () {
      $("#in-logo").value = "";
      setCenter("none", null).then(function () { refresh(0); });
    });
    $("#in-logo").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        setCenter("logo", "logo", r.result).then(function () { refresh(0); });
      };
      r.readAsDataURL(f);
    });

    $$("#formats .format").forEach(function (b) {
      b.addEventListener("click", function () {
        state.format = b.dataset.format;
        $$("#formats .format").forEach(function (f) {
          var on = f === b;
          f.classList.toggle("is-active", on);
          f.setAttribute("aria-checked", on ? "true" : "false");
        });
        var spec = BRAND.formats[state.format];
        var r = $("#in-size");
        r.min = spec.qrMin; r.max = spec.qrMax;
        state.sizeMm = spec.qrMm;
        r.value = spec.qrMm;
        $("#lbl-size").textContent = spec.qrMm + " mm";
        if (viewer) viewer.wake();
        refresh(0);
      });
    });

    var size = $("#in-size");
    size.addEventListener("input", function () {
      state.sizeMm = parseInt(size.value, 10);
      $("#lbl-size").textContent = state.sizeMm + " mm";
      refresh(90);
    });

    $("#in-relief").addEventListener("change", function () {
      state.relief = parseFloat(this.value);
      refresh(0);
    });

    $$("#emojis-3d .emoji").forEach(function (b) {
      b.addEventListener("click", function () {
        state.textEmoji = b.dataset.emoji || "";
        $$("#emojis-3d .emoji").forEach(function (c) { c.classList.toggle("is-active", c === b); });
        refresh(0);
      });
    });

    $("#btn-png").addEventListener("click", function () {
      var b = this;
      busy(b, true, "Generando…");
      downloadImage("png").catch(function (e) { console.warn(e); })
        .then(function () { busy(b, false); });
    });
    $("#btn-svg").addEventListener("click", function () {
      var b = this;
      busy(b, true, "Generando…");
      downloadImage("svg").catch(function (e) { console.warn(e); })
        .then(function () { busy(b, false); });
    });
    $("#btn-3mf").addEventListener("click", function () {
      var b = this, span = b.querySelector("span"), prev = span.textContent;
      b.disabled = true; span.textContent = "Preparando el archivo…";
      download3MF().catch(function (e) {
        console.warn(e);
        span.textContent = "No se ha podido generar. Inténtalo otra vez.";
      }).then(function () {
        b.disabled = false;
        setTimeout(function () { span.textContent = prev; }, 1200);
      });
    });
    $("#btn-stl").addEventListener("click", function () {
      var b = this;
      busy(b, true, "Preparando el ZIP…");
      downloadSTL().catch(function (e) { console.warn(e); })
        .then(function () { busy(b, false); });
    });
  }

  function initViewer() {
    var el = $("#viewer"), note = $("#viewer-note");
    if (!el || !G.createViewer) return;
    viewer = G.createViewer(el, function (status) {
      var msg = {
        "espera": "Preparando la vista 3D…",
        "cargando": "Cargando la vista 3D…",
        /* en un móvil no hay ratón ni rueda: el aviso se adapta al dispositivo */
        "listo": matchMedia("(pointer: coarse)").matches
          ? "Arrastra con el dedo para girar la pieza · pellizca para acercar"
          : "Arrastra con el ratón para girar la pieza · rueda para acercar",
        "sin-webgl": "Tu navegador no puede mostrar la vista 3D, pero las descargas " +
          "en 3MF, STL, PNG y SVG funcionan igual.",
        "error": "No se ha podido cargar la vista 3D. Las descargas siguen funcionando."
      }[status] || "";
      if (note) note.textContent = msg;
      el.classList.toggle("is-dead", status === "sin-webgl" || status === "error");
    });
  }

  function boot() {
    safe(initControls, "initControls");
    safe(initViewer, "initViewer");
    safe(initAds, "initAds");
    safe(render2D, "render2D");
    rebuild3D();
    document.documentElement.classList.add("is-ready");
  }

  /* Punto de inspección para las comprobaciones automáticas */
  window.__QRAPP__ = {
    state: function () {
      return {
        payload: payload(), modules: modules, format: state.format,
        sizeMm: state.sizeMm, moduleMm: modules ? state.sizeMm / modules : 0,
        relief: state.relief, colCode: state.colCode, colBase: state.colBase,
        contrast: contrast(state.colCode, state.colBase),
        built: built ? built.info : null,
        viewer: viewer ? viewer.status() : "sin-visor"
      };
    },
    set: function (patch) {
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      safe(render2D, "render2D");        // mismo orden que la interfaz real:
      return rebuild3D();                // el 2D fija los módulos que usa el 3D
    },
    rebuild: rebuild3D,
    visor: function () { return viewer && viewer.debug ? viewer.debug() : null; },
    paso: function () { return viewer && viewer.paso ? viewer.paso() : false; },
    make3MF: function () {
      return ensureBuilt().then(function (b) {
        return G.to3MF(b, state.colBase, state.colCode, "3DQRGenerator " + slug());
      });
    },
    makeSTLZip: function () {
      return ensureBuilt().then(function (b) { return G.toSTLZip(b); });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
