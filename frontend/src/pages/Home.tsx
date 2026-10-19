import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  RadioTower,
  CheckCircle2,
  ChevronRight,
  Globe,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Zap,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/home/Navbar';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { TrustMarkers } from '@/components/ui/TrustMarkers';

// ─── Feature data ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Multi-Number Workspaces',
    description:
      'Manage unlimited WhatsApp Business numbers across isolated workspaces with role-based access control.',
    badge: 'Multi-Tenant',
  },
  {
    icon: Bot,
    title: 'Autonomous AI Agents',
    description:
      'Deploy LLM-powered agents that handle conversations end-to-end within Meta service window compliance rules.',
    badge: 'AI-Powered',
  },
  {
    icon: RadioTower,
    title: 'Smart Broadcast Hub',
    description:
      'Safely schedule outbound campaigns with rolling 24-hour quota enforcement and opt-out circuit breakers.',
    badge: 'Campaigns',
  },
  {
    icon: Globe,
    title: 'Meta Embedded Signup',
    description:
      'Frictionless WhatsApp Business API onboarding via Meta embedded signup flow with zero manual portal steps.',
    badge: 'Meta Verified',
  },
  {
    icon: MessageSquare,
    title: 'Live Shared Inbox',
    description:
      'Real-time collaborative inbox with AI-supervised chats, human takeover, and async document parsing.',
    badge: 'Real-Time',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance & Safety',
    description:
      'Built-in GDPR/CCPA controls, message-rate guardrails, and audit logging to keep every workspace compliant.',
    badge: 'Compliance',
  },
];

const STATS = [
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '< 200ms', label: 'Avg. Response' },
  { value: '10M+', label: 'Messages Routed' },
  { value: '500+', label: 'Workspaces Active' },
];

export function Home() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20">
        {/* Ambient glows */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-12 -left-12 w-96 h-96 bg-primary-fixed/30 rounded-full blur-3xl" />
          <div className="absolute top-1/4 -right-12 w-96 h-96 bg-surface-container-highest/60 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-secondary-fixed/20 rounded-full blur-3xl" />
        </div>

        <Container className="relative z-10 flex flex-col items-center text-center py-20 gap-8">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary shadow-sm border border-outline-variant/30 transition-all hover:bg-surface-container">
            <MessageSquare className="size-4 text-tertiary" fill="currentColor" />
            <span className="text-[11px] font-bold tracking-wide uppercase text-on-surface">
              WhatsApp Business API + AI Gateway
            </span>
            <span className="size-1.5 rounded-full bg-tertiary" />
            <span className="text-[11px] font-semibold text-tertiary">Meta Verified</span>
            <ChevronRight className="size-3.5 opacity-60 text-outline" />
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.12] tracking-tight text-on-surface">
            Scale Customer Service &amp;{' '}
            <span className="gradient-text">WhatsApp Broadcasts</span>{' '}
            with Autonomous AI
          </h1>

          {/* Sub-headline */}
          <p className="max-w-2xl text-base sm:text-lg text-on-surface-variant leading-relaxed">
            Multi-tenant WhatsApp gateway with autonomous AI agent orchestration,
            async document parsing, 24-hour service window compliance, and
            safety-guarded outbound campaign batching.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3.5 mt-2 w-full sm:w-auto">
            <Link to="/register">
              <Button variant="primary" size="lg" className="w-full sm:w-auto glow-primary">
                <Zap className="size-5" />
                Start Building Free
                <ArrowRight className="size-5" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Explore Features
              </Button>
            </a>
          </div>

          {/* Trust markers */}
          <div className="mt-2">
            <TrustMarkers />
          </div>

          {/* Hero visual — simulated inbox card */}
          <div className="relative w-full max-w-4xl mt-6 animate-float">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-fixed/40 to-surface-container-highest/50 blur-2xl -z-10" />
            <Card
              variant="form"
              className="relative p-0 overflow-hidden border border-outline-variant/40 bg-surface-container-lowest shadow-xl shadow-surface-container/60"
            >
              {/* Window topbar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-container-high bg-surface-container-low/70">
                <div className="flex gap-1.5">
                  <div className="size-2.5 rounded-full bg-error" />
                  <div className="size-2.5 rounded-full bg-amber-400" />
                  <div className="size-2.5 rounded-full bg-tertiary" />
                </div>
                <div className="flex-1 flex justify-center">
                  <span className="text-xs font-mono text-outline">
                    app.metarouter.ai/workspace/neurosta
                  </span>
                </div>
              </div>

              {/* Inbox layout grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-container-high h-64 sm:h-72 text-left">
                {/* Active Chats Column */}
                <div className="p-3.5 space-y-2 bg-surface-container-low/30 overflow-y-auto">
                  <p className="text-[10px] font-bold text-outline uppercase tracking-wider mb-2.5">
                    Active Conversations
                  </p>
                  {[
                    { name: 'Priya Kumar', status: 'AI Active', time: '2m', active: true },
                    { name: 'Rajan Mehta', status: 'Human Agent', time: '5m', active: false },
                    { name: 'Anjali Nair', status: 'AI Active', time: '12m', active: false },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                        c.active
                          ? 'bg-surface-container-lowest shadow-xs border border-outline-variant/40'
                          : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="size-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {c.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-on-surface truncate">{c.name}</p>
                        <p
                          className={`text-[10px] font-medium ${
                            c.status === 'AI Active' ? 'text-tertiary' : 'text-secondary'
                          }`}
                        >
                          ● {c.status}
                        </p>
                      </div>
                      <span className="text-[10px] text-outline shrink-0">{c.time}</span>
                    </div>
                  ))}
                </div>

                {/* Chat window */}
                <div className="flex flex-col bg-surface-container-lowest">
                  <div className="px-3.5 py-2.5 border-b border-surface-container-high bg-surface-container-low/40 flex items-center justify-between text-xs font-semibold text-on-surface">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-tertiary" />
                      Priya Kumar
                    </span>
                    <span className="text-[10px] font-normal text-on-surface-variant">WhatsApp #91...</span>
                  </div>
                  <div className="flex-1 p-3.5 space-y-2.5 overflow-hidden flex flex-col justify-end">
                    <div className="flex gap-2 items-end">
                      <div className="max-w-[80%] rounded-xl rounded-tl-xs bg-surface-container-low px-3 py-2 text-xs text-on-surface border border-outline-variant/30">
                        Hi! I would like to automate our order confirmations on WhatsApp.
                      </div>
                    </div>
                    <div className="flex gap-2 items-end justify-end">
                      <div className="max-w-[80%] rounded-xl rounded-tr-xs bg-primary text-on-primary px-3 py-2 text-xs shadow-xs">
                        Certainly! MetaRouter connects directly to your catalog and dispatches template messages with verified compliance.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-tertiary font-medium">
                      <Bot className="size-3.5" />
                      <span>AI Agent online • Responding in &lt; 200ms</span>
                    </div>
                  </div>
                </div>

                {/* Side info panel */}
                <div className="p-3.5 bg-surface-container-low/30 hidden sm:block">
                  <p className="text-[10px] font-bold text-outline uppercase tracking-wider mb-3">
                    Compliance &amp; Session
                  </p>
                  <div className="space-y-3">
                    {[
                      { label: 'Customer Window', value: '23h 48m left' },
                      { label: 'Message Tier', value: 'Tier 3 (100k/day)' },
                      { label: 'Agent Policy', value: 'Supervised Safe' },
                      { label: 'Quality Rating', value: 'High (Green)' },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-[10px] text-outline uppercase font-semibold">{item.label}</p>
                        <p className="text-xs font-semibold text-on-surface">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-surface-container-high bg-surface-container-low/50">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold text-primary">{value}</p>
                <p className="mt-1 text-sm font-medium text-on-surface-variant">{label}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section id="features" className="py-24 relative overflow-hidden">
        <Container className="relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
              <Sparkles className="size-3.5" />
              Everything you need
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-on-surface tracking-tight">
              Built for scale, designed{' '}
              <span className="gradient-text">for simplicity</span>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-on-surface-variant text-base sm:text-lg">
              One unified platform to orchestrate every aspect of your WhatsApp business operations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description, badge }) => (
              <Card
                key={title}
                variant="feature"
                className="p-6 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs hover:shadow-md hover:border-primary/40 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 flex size-12 items-center justify-center rounded-xl bg-surface-container-low text-primary border border-outline-variant/30 transition-transform duration-200 group-hover:scale-105">
                    <Icon className="size-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="font-semibold text-on-surface text-base">{title}</h3>
                    </div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-low text-primary border border-outline-variant/30 mb-2">
                      {badge}
                    </span>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  Learn more <ArrowRight className="size-3.5" />
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Architecture section ───────────────────────────────────────────── */}
      <section id="architecture" className="py-24 bg-surface-container-low/40 border-y border-surface-container-high">
        <Container>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
                <Zap className="size-3.5" />
                Architecture
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight mb-6">
                Production-grade infrastructure{' '}
                <span className="gradient-text">from day one</span>
              </h2>
              <p className="text-on-surface-variant text-base sm:text-lg mb-8 leading-relaxed">
                MetaRouter is built on a battle-tested async stack — FastAPI, Celery + Redis, PostgreSQL — with Webhook relay and real-time delivery receipts baked in.
              </p>
              <ul className="space-y-3.5">
                {[
                  'FastAPI async message routing & webhook relay',
                  'Celery workers for PDF/doc async processing',
                  'Redis pub/sub for real-time inbox updates',
                  'PostgreSQL with full audit trail & tenant isolation',
                  'Meta Cloud API v22+ compliant',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-on-surface text-sm font-medium">
                    <CheckCircle2 className="size-5 text-tertiary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Architecture diagram card */}
            <Card variant="form" className="p-6 bg-surface-container-lowest border border-outline-variant/30 shadow-md">
              <div className="space-y-3.5 text-sm font-mono">
                {[
                  { from: 'WhatsApp Cloud API', to: 'FastAPI Webhook Handler', color: 'text-primary' },
                  { from: 'FastAPI', to: 'Celery + Redis Queue', color: 'text-secondary' },
                  { from: 'Celery Worker', to: 'LLM Agent Orchestrator', color: 'text-tertiary' },
                  { from: 'LLM Agent', to: 'PostgreSQL (Audit Log)', color: 'text-primary' },
                  { from: 'FastAPI', to: 'React Dashboard (WS)', color: 'text-secondary' },
                ].map(({ from, to, color }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-36 text-right text-on-surface-variant truncate text-xs">{from}</div>
                    <div className={`flex-1 flex items-center gap-2 ${color}`}>
                      <div className="h-px flex-1 bg-current opacity-30" />
                      <ArrowRight className="size-3.5 shrink-0" />
                    </div>
                    <div className="w-36 text-on-surface font-semibold truncate text-xs">{to}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-surface-container-high flex items-center justify-between text-xs text-on-surface-variant font-medium">
                <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" /> Multi-tenant</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-primary" /> Isolated</span>
                <span className="flex items-center gap-1.5"><Zap className="size-4 text-primary" /> Real-time</span>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      {/* ── Pricing section ────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <Container size="md">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
              Simple pricing
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
              Start free, scale as you grow
            </h2>
            <p className="mt-3 text-on-surface-variant text-base sm:text-lg">No hidden fees. No vendor lock-in.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                plan: 'Starter',
                price: 'Free',
                desc: 'Perfect for testing and prototypes',
                features: ['1 WhatsApp Number', '500 msgs/month', 'Basic AI Agent', 'Community Support'],
                cta: 'Get Started',
                primary: false,
              },
              {
                plan: 'Growth',
                price: '$49/mo',
                desc: 'For growing customer service teams',
                features: ['5 WhatsApp Numbers', '20k msgs/month', 'Advanced AI Agents', 'Broadcast Hub', 'Priority Support'],
                cta: 'Start Trial',
                primary: true,
              },
              {
                plan: 'Enterprise',
                price: 'Custom',
                desc: 'Unlimited scale & dedicated support',
                features: ['Unlimited Numbers', 'Unlimited messages', 'Custom LLM Integration', 'SLA + Dedicated CSM', 'Audit Log & Compliance'],
                cta: 'Contact Sales',
                primary: false,
              },
            ].map(({ plan, price, desc, features, cta, primary }) => (
              <Card
                key={plan}
                variant={primary ? 'form' : 'default'}
                className={`p-6 flex flex-col ${
                  primary
                    ? 'ring-2 ring-primary bg-surface-container-lowest shadow-xl shadow-surface-container/60 relative'
                    : 'bg-surface-container-lowest border border-outline-variant/30'
                }`}
              >
                {primary && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-on-primary text-[11px] font-bold shadow-sm">
                    Most Popular
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-sm font-semibold text-on-surface-variant mb-1">{plan}</p>
                  <p className="text-3xl font-extrabold text-on-surface">{price}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{desc}</p>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <CheckCircle2 className="size-4 text-tertiary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register">
                  <Button variant={primary ? 'primary' : 'secondary'} size="md" className="w-full">
                    {cta}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section className="py-20 relative overflow-hidden bg-surface-container-low/50 border-t border-surface-container-high">
        <Container size="md" className="relative z-10 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight mb-4">
            Ready to automate your{' '}
            <span className="gradient-text">WhatsApp operations?</span>
          </h2>
          <p className="text-base sm:text-lg text-on-surface-variant mb-8 max-w-xl mx-auto">
            Join hundreds of businesses already using MetaRouter to deliver AI-powered customer service at scale.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg" className="glow-primary">
              Create Your Workspace
              <ArrowRight className="size-5" />
            </Button>
          </Link>
        </Container>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-container-high bg-surface-container-lowest py-12">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="mb-3">
                <BrandLogo size="md" />
              </div>
              <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
                The multi-tenant WhatsApp AI gateway for modern businesses. Build, deploy, and scale conversational AI in minutes.
              </p>
              <div className="mt-5">
                <TrustMarkers />
              </div>
            </div>

            {/* Links */}
            {[
              { heading: 'Product', links: ['Features', 'Architecture', 'Pricing', 'Documentation'] },
              { heading: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold text-on-surface mb-3">{heading}</h4>
                <ul className="space-y-2">
                  {links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-sm text-on-surface-variant hover:text-primary transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-surface-container-high pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-on-surface-variant">
            <span>© 2026 MetaRouter AI • Encrypted WhatsApp Business Solution</span>
            <div className="flex gap-6">
              {['Privacy', 'Terms', 'Security'].map((l) => (
                <a key={l} href="#" className="hover:text-primary transition-colors">
                  {l}
                </a>
              ))}
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
