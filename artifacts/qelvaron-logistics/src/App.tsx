import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Anchor,
  Check,
  ChevronDown,
  Globe2,
  Menu,
  PackageCheck,
  Plane,
  Route as RouteIcon,
  Ship,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formNote, setFormNote] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [inquiryCopied, setInquiryCopied] = useState(false);
  const [preparedMessage, setPreparedMessage] = useState('');

  const closeMenu = () => setMenuOpen(false);

  async function handleInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = [
      'Qelvaron Global Logistics — customer inquiry',
      `Name: ${form.get('name')}`,
      `Company: ${form.get('company') || 'Not provided'}`,
      `Email: ${form.get('email')}`,
      `Service of interest: ${form.get('service')}`,
      `Shipment notes: ${form.get('message')}`,
    ].join('\n');
    setPreparedMessage(details);
    try {
      await navigator.clipboard.writeText(details);
      setInquiryCopied(true);
      setFormNote('Your inquiry has been copied to this device. This website does not send the form to Qelvaron.');
    } catch {
      setInquiryCopied(false);
      setFormNote('Your inquiry is ready below. Copy it and contact Qelvaron through your usual business channel.');
    }
    setPrepared(true);
  }

  return (
    <div className="site-shell">
      <header className="header">
        <div className="wrap header-inner">
          <a className="brand" href="#home" aria-label="Qelvaron Global Logistics home" onClick={closeMenu}>
            <span className="brand-mark"><Anchor size={19} strokeWidth={1.8} /></span>
            <span className="brand-name">Qelvaron<span>Global Logistics</span></span>
          </a>
          <nav className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
            <a href="#about" onClick={closeMenu}>About</a>
            <a href="#services" onClick={closeMenu}>Services</a>
            <a href="#approach" onClick={closeMenu}>How we work</a>
            <a href="#location" onClick={closeMenu}>Location</a>
          </nav>
          <div className="nav-right">
            <span className="header-location">MIAMI, FL · USA</span>
            <a className="button button-light" href="#contact">Start a conversation <ArrowUpRight size={15} /></a>
            <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-image" />
          <div className="hero-grid" />
          <div className="wrap hero-content">
            <div className="hero-kicker eyebrow reveal"><span className="dot" /> Logistics, with a clear point of view</div>
            <h1 className="display reveal delay-1">Moving goods.<br /><em>Mindfully.</em></h1>
            <p className="hero-copy reveal delay-2">A Miami-based logistics partner for businesses navigating freight, storage, and distribution. Clear coordination from the first conversation onward.</p>
            <div className="hero-actions reveal delay-2">
              <a className="button button-orange" href="#contact">Discuss a shipment <ArrowRight size={16} /></a>
              <a className="button button-outline" href="#services">Explore services <ArrowDown size={15} /></a>
            </div>
          </div>
          <div className="wrap hero-bottom">
            <div className="hero-index">01 / QELVARON GLOBAL LOGISTICS</div>
            <a className="hero-scroll" href="#about">Scroll to explore <ChevronDown size={15} /></a>
          </div>
        </section>

        <section className="section intro" id="about">
          <div className="wrap intro-grid">
            <div>
              <div className="section-kicker eyebrow">A steadier way to move</div>
              <h2 className="display">Logistics should feel <span style={{ color: '#b3441b' }}>considered.</span></h2>
            </div>
            <div className="intro-aside">
              <p><strong>Qelvaron Global Logistics</strong> is based in Miami, Florida, a city shaped by movement and connection.</p>
              <p>We bring a practical, attentive approach to freight and supply-chain needs—starting with understanding what matters to your business, then coordinating the details with care.</p>
              <a className="button button-outline" style={{ color: '#060517', marginTop: 12 }} href="#approach">How we approach the work <ArrowRight size={15} /></a>
            </div>
          </div>
        </section>

        <section className="section service-section" id="services">
          <div className="wrap">
            <div className="section-kicker eyebrow" style={{ color: '#ff8555' }}>Capabilities</div>
            <div className="section-head">
              <h2 className="display">The right mode.<br />The right details.</h2>
              <p>Explore the service categories Qelvaron can discuss with your team. Scope and availability are confirmed for each shipment.</p>
            </div>
            <div className="service-grid">
              <article className="service-card">
                <div className="service-card-top"><Plane size={26} strokeWidth={1.4} /><span className="service-number">01 / AIR</span></div>
                <div><h3>Air freight</h3><p>Air cargo coordination for shipments where air transport is the right fit.</p><a className="service-arrow" href="#contact" aria-label="Ask about air freight"><ArrowRight size={19} /></a></div>
              </article>
              <article className="service-card">
                <div className="service-card-top"><Truck size={26} strokeWidth={1.4} /><span className="service-number">02 / LAND</span></div>
                <div><h3>Land distribution</h3><p>Road transport coordination for domestic and cross-border movement.</p><a className="service-arrow" href="#contact" aria-label="Ask about land distribution"><ArrowRight size={19} /></a></div>
              </article>
              <article className="service-card">
                <div className="service-card-top"><Ship size={26} strokeWidth={1.4} /><span className="service-number">03 / SEA</span></div>
                <div><h3>Sea freight</h3><p>Ocean freight options for containerized and consolidated cargo needs.</p><a className="service-arrow" href="#contact" aria-label="Ask about sea freight"><ArrowRight size={19} /></a></div>
              </article>
              <article className="service-card">
                <div className="service-card-top"><Warehouse size={26} strokeWidth={1.4} /><span className="service-number">04 / STORAGE</span></div>
                <div><h3>Warehousing</h3><p>Warehousing and inventory support to complement your distribution plans.</p><a className="service-arrow" href="#contact" aria-label="Ask about warehousing"><ArrowRight size={19} /></a></div>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="approach">
          <div className="wrap approach">
            <div className="approach-title">
              <div className="section-kicker eyebrow">How we work</div>
              <h2 className="display">Good logistics starts with good questions.</h2>
              <p>Every shipment has its own requirements. A thoughtful conversation helps set the right course before details are put in motion.</p>
            </div>
            <div className="steps">
              <div className="step">
                <span className="step-num">01</span>
                <div><h3>Understand the need</h3><p>Share your cargo, origin, destination, and any handling considerations. We begin by clarifying the ask.</p></div>
                <Globe2 className="step-icon" size={21} strokeWidth={1.4} />
              </div>
              <div className="step">
                <span className="step-num">02</span>
                <div><h3>Discuss the options</h3><p>We can talk through relevant transport and storage categories, along with the details to confirm before proceeding.</p></div>
                <RouteIcon className="step-icon" size={21} strokeWidth={1.4} />
              </div>
              <div className="step">
                <span className="step-num">03</span>
                <div><h3>Coordinate the next steps</h3><p>Once scope and arrangements are agreed, the shipment plan can be coordinated with the parties involved.</p></div>
                <PackageCheck className="step-icon" size={21} strokeWidth={1.4} />
              </div>
            </div>
          </div>
        </section>

        <section className="location-band" id="location">
          <div className="location-grid">
            <div className="location-copy">
              <div className="section-kicker eyebrow">Rooted in South Florida</div>
              <h2 className="display">Miami is our starting point.</h2>
              <p>Qelvaron Global Logistics is based in Miami, Florida, USA. For shipment questions and service availability, reach out through the inquiry form.</p>
              <a className="button button-outline" style={{ color: '#060517' }} href="#contact">Get in touch <ArrowRight size={15} /></a>
            </div>
            <div className="location-graphic" role="img" aria-label="Abstract map graphic marking Miami, Florida">
              <div className="map-lines" /><div className="map-water" />
              <div className="map-label">SOUTH FLORIDA / USA</div>
              <div className="map-tag"><Globe2 size={15} /> MIAMI, FLORIDA</div>
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="wrap contact-grid">
            <div>
              <div className="eyebrow">Start here</div>
              <h2 className="display">Let's talk through the details.</h2>
              <p className="contact-intro">Tell us a little about what you need. This page can prepare your inquiry, but does not send it—contact channels are still being confirmed.</p>
            </div>
            <form className="contact-form" onSubmit={handleInquiry}>
              <div className="form-field">
                <label htmlFor="name">Your name</label>
                <input id="name" name="name" placeholder="Name" required />
              </div>
              <div className="form-field">
                <label htmlFor="company">Company <span style={{ opacity: .55 }}>· optional</span></label>
                <input id="company" name="company" placeholder="Company name" />
              </div>
              <div className="form-field">
                <label htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" placeholder="you@company.com" required />
              </div>
              <div className="form-field">
                <label htmlFor="service">Service of interest</label>
                <select id="service" name="service" defaultValue="" required>
                  <option value="" disabled>Select a service</option>
                  <option>Air freight</option><option>Land distribution</option><option>Sea freight</option><option>Warehousing</option><option>Not sure yet</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="message">A few shipment details</label>
                <textarea id="message" name="message" placeholder="Cargo, origin, destination, or anything else to know" required />
              </div>
              <button className="button button-orange" type="submit">{inquiryCopied ? <><Check size={16} /> Inquiry copied</> : <>{prepared ? 'Copy inquiry again' : 'Copy inquiry'} <ArrowRight size={16} /></>}</button>
              <p className={`form-note${prepared ? ' success' : ''}`} aria-live="polite">{formNote || 'This form copies your inquiry to this device; it does not send it to Qelvaron.'}</p>
              {preparedMessage&&<textarea className="contact-text-field" rows={7} aria-label="Inquiry message ready to copy" value={preparedMessage} readOnly />}
            </form>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-top">
            <div className="footer-brand">
              <a className="brand" href="#home">
                <span className="brand-mark"><Anchor size={18} strokeWidth={1.8} /></span>
                <span className="brand-name">Qelvaron<span>Global Logistics</span></span>
              </a>
              <p>Freight and logistics coordination from Miami, Florida.</p>
            </div>
            <div className="footer-col">
              <h4>Explore</h4>
              <a href="#about">About Qelvaron</a><a href="#services">Service categories</a><a href="#approach">How we work</a><a href="#location">Our location</a>
            </div>
            <div className="footer-col">
              <h4>Contact details</h4>
              <p>Business Address: To be confirmed</p><p>Email: To be confirmed</p><p>Phone: To be confirmed</p><p>Miami, Florida, USA</p>
            </div>
          </div>
          <div className="footer-bottom"><span>© {new Date().getFullYear()} Qelvaron Global Logistics</span><a className="to-top" href="#home">Back to top ↑</a></div>
        </div>
      </footer>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
