import { Link } from 'react-router-dom';
import {
  Check,
  ClipboardList,
  Layers,
  PenTool,
  Ruler,
  ScanSearch,
  Wind,
} from 'lucide-react';
import { SiteNav } from '../components/site/SiteNav';

const FEATURES = [
  {
    icon: ScanSearch,
    title: 'Automatisk målestokk',
    text: 'Søker gjennom PDF-tegningens tekst etter målestokk, eller kalibrer manuelt med to klikk.',
  },
  {
    icon: PenTool,
    title: 'Tegn rør og kanaler',
    text: 'Velg bygningsdel, rørtype og dimensjon – tegn rett på tegningen med Shift-snapping til standard bend-vinkler.',
  },
  {
    icon: Layers,
    title: 'NS 3451-kategorier',
    text: 'Sanitær, varme, kjøling og ventilasjon strukturert i hovedkategorier og underkategorier, klart for eksport.',
  },
  {
    icon: ClipboardList,
    title: 'Sanntids mengdeliste',
    text: 'Lengder, bend, overganger og komponenter telles automatisk og oppdateres mens du tegner.',
  },
  {
    icon: Wind,
    title: 'VVS og ventilasjon',
    text: 'Egne verktøy for kanaler med riktig dimensjonssett og symboler for spjeld, lyddempere og ventiler.',
  },
  {
    icon: Ruler,
    title: 'Prosjekt- og tilbudsstruktur',
    text: 'Organiser arbeidet i prosjekter og tilbud – hvert tilbud har sin egen mengdeliste.',
  },
];

const PLANS = [
  {
    name: 'Gratis',
    price: '0 kr',
    period: '/ måned',
    features: ['1 aktivt prosjekt', 'Inntil 3 tilbud', 'Mengdeuttak fra PDF', 'Eksport til mengdeliste'],
    cta: 'Kom i gang',
    featured: false,
  },
  {
    name: 'Pro',
    price: '690 kr',
    period: '/ måned',
    features: [
      'Ubegrensede prosjekter',
      'Ubegrensede tilbud',
      'Automatisk målestokk-søk',
      'Shift-snapping for bend',
      'Prioritert support',
    ],
    cta: 'Start prøveperiode',
    featured: true,
  },
  {
    name: 'Bedrift',
    price: 'Avtales',
    period: '',
    features: ['Flere brukere/team', 'Egen onboarding', 'SLA og support', 'Tilpassede kategorier'],
    cta: 'Kontakt oss',
    featured: false,
  },
];

export default function Landing() {
  return (
    <div className="site">
      <SiteNav />

      <section className="site-hero">
        <div className="site-hero-inner">
          <div>
            <span className="site-eyebrow">Bygget for VVS og ventilasjon</span>
            <h1 className="site-hero-title">Mengdeuttak fra PDF-tegninger, uten Excel-kaos</h1>
            <p className="site-hero-sub">
              Last opp tegningen, tegn rør og kanaler rett på PDF-en, og få en mengdeliste som
              oppdateres i sanntid – organisert per prosjekt og tilbud.
            </p>
            <div className="site-hero-actions">
              <Link to="/register" className="site-btn primary">
                Prøv gratis
              </Link>
              <a href="#funksjoner" className="site-btn ghost">
                Se hvordan det fungerer
              </a>
            </div>
            <p className="site-hero-note">Ingen kredittkort nødvendig · klar på under 2 minutter</p>
          </div>

          <div className="site-hero-visual">
            <div className="site-mock-toolbar">
              <span className="site-mock-dot" />
              <span className="site-mock-dot" />
              <span className="site-mock-dot" />
            </div>
            <div className="site-mock-canvas" />
            <div className="site-mock-table">
              <div className="site-mock-row">
                <span>Varmtvannsrør · Kobber · DN18</span>
                <strong>24,8 m</strong>
              </div>
              <div className="site-mock-row">
                <span>Avtrekkskanal · Ø200</span>
                <strong>12,1 m</strong>
              </div>
              <div className="site-mock-row">
                <span>Bend 90° · DN18</span>
                <strong>4 stk</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" id="funksjoner">
        <div className="site-section-head">
          <h2 className="site-section-title">Alt du trenger for mengdeuttak</h2>
          <p className="site-section-sub">
            Fra opplasting av tegning til ferdig mengdeliste – samlet på ett sted.
          </p>
        </div>
        <div className="site-features-grid">
          {FEATURES.map((f) => (
            <div className="site-feature-card" key={f.title}>
              <span className="site-feature-icon">
                <f.icon size={19} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section alt" id="priser">
        <div className="site-section-head">
          <h2 className="site-section-title">Enkel, forutsigbar prising</h2>
          <p className="site-section-sub">Start gratis. Oppgrader når teamet vokser.</p>
        </div>
        <div className="site-pricing-grid">
          {PLANS.map((plan) => (
            <div className={`site-price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              {plan.featured && <span className="site-price-badge">Mest populær</span>}
              <span className="site-price-name">{plan.name}</span>
              <div className="site-price-amount">
                {plan.price}
                {plan.period && <span>{plan.period}</span>}
              </div>
              <ul className="site-price-list">
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check size={15} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`site-btn ${plan.featured ? 'primary' : 'ghost'} full`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="site-cta">
          <h2>Klar for å slippe Excel-mengdene?</h2>
          <p>Kom i gang med ditt første prosjekt på under to minutter.</p>
          <Link to="/register" className="site-btn primary">
            Prøv gratis
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>© {new Date().getFullYear()} IstrefiCAD</span>
          <span>Laget for VVS- og ventilasjonsbransjen</span>
        </div>
      </footer>
    </div>
  );
}
