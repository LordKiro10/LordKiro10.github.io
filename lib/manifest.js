/* 3DQRGenerator — datos de marca y parámetros del generador.
   Único global expuesto: window.__BRAND__ */
(function () {
  "use strict";

  window.__BRAND__ = {
    name: "3DQRGenerator",
    tagline: "Códigos QR para imprimir en 3D",
    empresa: "Kiro Inversiones",
    domain: "3dqrgenerator",

    /* Presets de estilo: un solo control para el usuario, tres opciones internas */
    styles: {
      clasico:    { label: "Clásico",    dots: "square",         corners: "square",        cornerDot: "square" },
      redondeado: { label: "Redondeado", dots: "rounded",        corners: "extra-rounded", cornerDot: "dot"    },
      puntos:     { label: "Puntos",     dots: "dots",           corners: "dot",           cornerDot: "dot"    },
      elegante:   { label: "Elegante",   dots: "classy-rounded", corners: "extra-rounded", cornerDot: "square" }
    },

    /* Emojis para el centro del código y para el texto en relieve */
    emojis: ["🍽️","☕","⭐","📶","📸","🛒","💈","🏠","🎉","📍","❤️","🍕","🍺","💬","🔑","🐾"],

    /* Formatos de objeto imprimible. Medidas en milímetros. */
    formats: {
      soporte: {
        label: "Soporte de mesa",
        hint: "Para cartas de restaurante o «déjanos una reseña».",
        qrMm: 60, qrMin: 40, qrMax: 100,
        slopeDeg: 52,      // inclinación de la cara del QR respecto a la horizontal
        lipMm: 3.0,        // labio frontal para que no acabe en filo
        marginMm: 8,       // margen alrededor del QR en la cara
        textMm: 7          // altura de la banda de texto
      },
      llavero: {
        label: "Llavero",
        hint: "Con agujero para la anilla. Ideal para eventos y ferias.",
        qrMm: 45, qrMin: 28, qrMax: 65,
        plateThickMm: 3.0,
        marginMm: 4,
        textMm: 6,
        ringOuterMm: 9,    // diámetro exterior de la pestaña
        ringHoleMm: 4.2    // diámetro del agujero de la anilla
      },
      placa: {
        label: "Placa de pared",
        hint: "Con dos agujeros para colgarla o atornillarla.",
        qrMm: 80, qrMin: 50, qrMax: 150,
        plateThickMm: 3.2,
        marginMm: 8,
        textMm: 9,
        holeMm: 4.0        // diámetro de los agujeros de colgar
      }
    },

    /* Reglas de calidad de impresión que la web vigila en vivo */
    print: {
      minModuleMm: 1.5,     // por debajo, la boquilla redondea los cuadros
      minContrast: 3.0,     // ratio WCAG mínimo entre los dos colores
      reliefMm: [0.8, 1.2, 1.6],
      reliefDefault: 1.2,
      sinkMm: 0.15,         // el relieve se hunde en la base para soldar
      quietModules: 4       // zona de silencio obligatoria alrededor del código
    }
  };
})();
