import { Link } from 'react-router-dom';
import {
  Check,
  ClipboardList,
  Download,
  Droplet,
  Flame,
  Layers,
  LibraryBig,
  PenTool,
  Ruler,
  ScanSearch,
  Snowflake,
  Upload,
  Wind,
} from 'lucide-react';
import { SiteNav } from '../components/site/SiteNav';
import { HeroDemo } from '../components/site/HeroDemo';

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
    title: 'Flere systemer, samme tegning',
    text: 'Lag et nytt tilbud på samme PDF for å holde rør og ventilasjon i hver sin mengdeliste, uten å tegne opp underlaget på nytt.',
  },
  {
    icon: ClipboardList,
    title: 'Sanntids mengdeliste',
    text: 'Lengder, bend, overganger og komponenter telles automatisk og oppdateres mens du tegner.',
  },
  {
    icon: LibraryBig,
    title: 'Stort symbolbibliotek',
    text: 'Søkbart bibliotek med ventiler, spjeld, diffusorer og varmegjenvinnere – pluss dine egne komponenter med egne felter.',
  },
  {
    icon: Ruler,
    title: 'Prosjekt- og tilbudsstruktur',
    text: 'Organiser arbeidet i prosjekter og tilbud – hvert tilbud har sin egen mengdeliste.',
  },
];

const STEPS = [
  { icon: Upload, title: 'Last opp', text: 'Dra inn PDF-tegningen – målestokken finnes automatisk eller kalibreres på to klikk.' },
  { icon: PenTool, title: 'Tegn', text: 'Klikk rett på tegningen for å legge inn rør, kanaler, ventiler og spjeld.' },
  { icon: ClipboardList, title: 'Se mengdelisten', text: 'Lengder, bend og komponenter telles opp automatisk mens du tegner.' },
  { icon: Download, title: 'Eksporter', text: 'Last ned som Excel eller skriv ut en liggende PDF-rapport med tegning og mengdeliste.' },
];

const TRUST_ITEMS = [
  { icon: Droplet, label: 'Sanitæranlegg' },
  { icon: Flame, label: 'Varmeanlegg' },
  { icon: Snowflake, label: 'Kjøleanlegg' },
  { icon: Wind, label: 'Ventilasjonsanlegg' },
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
              <a
                href="#demo"
                className="site-btn ghost"
                onClick={(e) => {
                  // Rå #-ankere kolliderer med HashRouter (window.location.hash ER
                  // ruten) – en `<a href="#demo">` ville trigget en ekte
                  // rutenavigasjon til "/demo" og blitt sendt til catch-all-ruten.
                  // Scroll manuelt til demo-boksen i stedet.
                  e.preventDefault();
                  document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
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
              <span className="site-mock-tab">ventilasjon.pdf</span>
            </div>
            <HeroDemo />
          </div>
        </div>
      </section>

      <section className="site-section site-steps">
        <div className="site-section-head">
          <h2 className="site-section-title">Slik fungerer det</h2>
          <p className="site-section-sub">Fra opplastet tegning til ferdig eksportert mengdeliste, i fire steg.</p>
        </div>
        <div className="site-steps-row">
          {STEPS.map((s, i) => (
            <div className="site-step" key={s.title}>
              <span className="site-step-num">{i + 1}</span>
              <span className="site-step-icon">
                <s.icon size={18} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
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

      <section className="site-trust-strip">
        <span className="site-trust-label">Bygget for NS 3451</span>
        <div className="site-trust-items">
          {TRUST_ITEMS.map((t) => (
            <span className="site-trust-item" key={t.label}>
              <t.icon size={16} />
              {t.label}
            </span>
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
