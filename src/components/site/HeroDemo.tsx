/** Selvspillende, kodebasert demo i forsidens hero-boks (erstatter den statiske
 * `.site-mock-canvas`/`.site-mock-table`-attrappen). Ingen videofil – unngår
 * `base: '/EagleMengder/'`-fella i vite.config.ts og GitHub Pages'
 * filstørrelsesgrenser, og trenger ingen ekte skjermopptak.
 *
 * Ren SVG + CSS-keyframes (definert i site.css, prefikset `.hero-demo-*`/`@keyframes
 * hero-*`) i fire takter som looper over 14s: (1) kanaler tegnes frem med en liten
 * sikte-markør som «fører pennen», (2) spjeld/lyddemper/tilluftsventil poppes inn,
 * (3) mengdelisten fylles radvis, (4) eksport-brikkene (Excel/PDF) pulserer.
 *
 * ALLE animerte elementer deler nøyaktig samme `animation-duration` (14s) og
 * starter samtidig uten `animation-delay` – innbyrdes timing kodes utelukkende via
 * keyframe-prosent, slik at rekkefølgen alltid stemmer uansett når komponenten
 * monteres. Siste keyframe (100%) = ferdig tegning + full mengdeliste, slik at
 * `@media (prefers-reduced-motion: reduce)` (som i site.css already setter
 * animation-duration til 0.01ms) lander brukeren på sluttresultatet i stedet for
 * en tom boks. */
export function HeroDemo() {
  return (
    <div id="demo" aria-hidden="true">
      <div className="site-mock-canvas">
      <svg className="hero-demo-svg" viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="heroDuct" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c7d6ec" />
            <stop offset="45%" stopColor="#8ba3c7" />
            <stop offset="100%" stopColor="#c7d6ec" />
          </linearGradient>
        </defs>

        {/* ── Kanaler (tegnes frem via stroke-dashoffset) ─────────────────── */}
        <path
          className="hero-demo-duct hero-duct-a"
          d="M 40 70 L 250 70"
          pathLength={100}
        />
        <path
          className="hero-demo-duct hero-duct-b"
          d="M 250 70 L 250 160 L 340 160"
          pathLength={100}
        />
        <path className="hero-demo-duct hero-duct-c" d="M 140 70 L 140 140" pathLength={100} />

        {/* ── Sikte som «fører pennen» langs hvert segment ────────────────── */}
        <g className="hero-demo-crosshair hero-crosshair-a">
          <circle r="6" />
          <line x1="-9" y1="0" x2="9" y2="0" />
          <line x1="0" y1="-9" x2="0" y2="9" />
        </g>
        <g className="hero-demo-crosshair hero-crosshair-b">
          <circle r="6" />
          <line x1="-9" y1="0" x2="9" y2="0" />
          <line x1="0" y1="-9" x2="0" y2="9" />
        </g>
        <g className="hero-demo-crosshair hero-crosshair-c">
          <circle r="6" />
          <line x1="-9" y1="0" x2="9" y2="0" />
          <line x1="0" y1="-9" x2="0" y2="9" />
        </g>

        {/* ── Spjeld på hovedkanalen ───────────────────────────────────────── */}
        {/* Ytre <g transform="translate(...)"> holder KUN posisjon (statisk XML-
            attributt); indre <g className="hero-demo-equip …"> holder KUN CSS-
            animasjonen. Chrome/Safari (SVG2) lar CSS `transform` fra keyframes
            overstyre – ikke kombinere med – et `transform`-attributt på SAMME
            element, så et animert scale() på et element som også har
            transform="translate(...)" hopper til viewBox-origo. Delt på to
            nøstede grupper unngår kollisjonen. */}
        <g transform="translate(180 70)">
          <g className="hero-demo-equip hero-equip-damper">
            <rect x="-11" y="-11" width="22" height="22" rx="3" />
            <line x1="-7" y1="-7" x2="7" y2="7" />
          </g>
        </g>

        {/* ── Lyddemper som en bredere kapsel midt på nedstrekket ─────────── */}
        <g transform="translate(250 115)">
          <g className="hero-demo-equip hero-equip-silencer">
            <rect x="-15" y="-9" width="30" height="18" rx="9" />
          </g>
        </g>

        {/* ── Tilluftsventil for enden av avgreiningen, med luftpiler ─────── */}
        <g transform="translate(140 152)">
          <g className="hero-demo-equip hero-equip-diffuser">
            <rect x="-13" y="-13" width="26" height="26" rx="4" />
            <line x1="-13" y1="0" x2="13" y2="0" />
            <line x1="0" y1="-13" x2="0" y2="13" />
            <path className="hero-demo-airflow" d="M -13 18 L -20 28 M 0 18 L 0 30 M 13 18 L 20 28" />
          </g>
        </g>
      </svg>
      </div>

      <div className="hero-demo-table">
        <div className="hero-demo-row hero-row-1">
          <span>Tilluftskanal · Spirokanal (stål) · Ø160</span>
          <strong>18,4 m</strong>
        </div>
        <div className="hero-demo-row hero-row-2">
          <span>Tilluftsventil · Ø160</span>
          <strong>1 stk</strong>
        </div>
        <div className="hero-demo-row hero-row-3">
          <span>Spjeld (hånd) · Ø160</span>
          <strong>1 stk</strong>
        </div>
        <div className="hero-demo-row hero-row-4">
          <span>Lyddemper · Ø160 · 900 mm</span>
          <strong>1 stk</strong>
        </div>
      </div>

      <div className="hero-demo-export">
        <span className="hero-demo-chip hero-chip-excel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Excel (.xlsx)
        </span>
        <span className="hero-demo-chip hero-chip-pdf">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Skriv ut / PDF
        </span>
      </div>
    </div>
  );
}
