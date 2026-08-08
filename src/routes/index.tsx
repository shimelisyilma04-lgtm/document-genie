import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  FileSearch,
  FileStack,
  Layers,
  Lock,
  Quote,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import heroImage from "@/assets/hero-documents.jpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniParse AI — Your AI Document Employee" },
      {
        name: "description",
        content:
          "OmniParse AI reads contracts, reports, scans and PDFs, then answers questions with page-level citations. Upload, process, ask.",
      },
      { property: "og:title", content: "OmniParse AI — Your AI Document Employee" },
      {
        property: "og:description",
        content:
          "Turn document piles into answers. Secure upload, OCR, and a grounded AI analyst that cites its sources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const capabilities = [
  {
    icon: FileStack,
    title: "Every document format",
    body: "PDFs, Word files, plain text and scanned images are parsed into structured, page-aware text.",
  },
  {
    icon: ScanLine,
    title: "OCR for scans",
    body: "Photographed and scanned pages are transcribed, preserving headings, lists and table rows.",
  },
  {
    icon: FileSearch,
    title: "Cited answers",
    body: "Answers reference the page and section they came from — and say so plainly when a fact isn't there.",
  },
  {
    icon: Layers,
    title: "Workspaces",
    body: "Group documents by client, matter or project, then question the whole set at once.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Files live in private storage. Row-level rules make every record reachable only by its owner.",
  },
  {
    icon: BadgeCheck,
    title: "Usage you can see",
    body: "Requests, tokens and processed documents are tracked per account, visible in your dashboard.",
  },
];

const steps = [
  { step: "01", title: "Upload", body: "Drag in a contract, report or scan. Validation and progress are instant." },
  { step: "02", title: "Process", body: "Text and structure are extracted, then split into retrievable sections." },
  { step: "03", title: "Interrogate", body: "Ask anything. Summaries, key data, action items — with citations." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#capabilities">
              Capabilities
            </a>
            <a className="transition-colors hover:text-foreground" href="#how-it-works">
              How it works
            </a>
            <a className="transition-colors hover:text-foreground" href="#security">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" search={{ mode: "signin", redirect: undefined }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="ink-panel relative overflow-hidden">
          <div className="grid-backdrop absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-28">
            <div>
              <Badge className="mb-6 border-gold/40 bg-gold/10 text-gold hover:bg-gold/15">
                <Sparkles className="mr-1.5 size-3.5" /> AI Document Employee
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.05] text-ink-foreground sm:text-5xl lg:text-6xl">
                Your documents,
                <br />
                <span className="gold-text">answered.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
                OmniParse AI reads your contracts, invoices, reports and scans, then works like a
                diligent analyst: summarising, extracting, explaining — and citing the page every
                answer came from.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="gold">
                  <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>
                    Start free <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="onInk">
                  <Link to="/auth" search={{ mode: "signin", redirect: undefined }}>
                    Sign in
                  </Link>
                </Button>
              </div>
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
                {[
                  { k: "4 formats", v: "PDF · DOCX · TXT · Scans" },
                  { k: "Page-level", v: "citations on answers" },
                  { k: "Private", v: "per-user isolation" },
                ].map((item) => (
                  <div key={item.k}>
                    <dt className="font-display text-sm font-semibold text-gold">{item.k}</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{item.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-white/10 shadow-lift">
                <img
                  src={heroImage}
                  alt="Documents connected by glowing links, representing AI document analysis"
                  width={1440}
                  height={1088}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 left-4 right-4 rounded-xl border border-white/10 bg-ink/90 p-4 shadow-lift backdrop-blur sm:left-8 sm:right-8">
                <div className="flex items-start gap-3">
                  <Bot className="mt-0.5 size-5 shrink-0 text-gold" />
                  <p className="text-xs leading-relaxed text-ink-muted">
                    <span className="text-ink-foreground">Analyst:</span> The renewal notice period
                    is 60 days before term end{" "}
                    <span className="font-medium text-gold">[D1 p.7 — Termination]</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Built for documents that actually matter
            </h2>
            <p className="mt-4 text-muted-foreground">
              Not a chat toy. A document workflow: ingest, extract, retrieve, answer — with the
              receipts attached.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, body }) => (
              <div key={title} className="surface-panel p-6 transition-shadow hover:shadow-lift">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <h2 className="text-3xl font-semibold sm:text-4xl">Three steps to an answer</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((item) => (
                <div key={item.step} className="rounded-xl border border-border bg-surface p-6">
                  <span className="font-display text-sm font-semibold text-gold">{item.step}</span>
                  <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Security
              </p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Your files stay yours
              </h2>
              <ul className="mt-6 space-y-4 text-sm text-muted-foreground">
                {[
                  "Private storage — files are never publicly addressable and are served through short-lived signed links.",
                  "Database rules scope every document, chunk, conversation and message to its owner.",
                  "AI keys live only on the server; the browser never sees a model credential.",
                  "Deleting a document removes its file, extracted text and search index.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ink-panel relative overflow-hidden rounded-2xl p-8">
              <Quote className="size-8 text-gold" />
              <p className="mt-4 text-lg leading-relaxed text-ink-foreground">
                “If the document doesn't say it, OmniParse says so.”
              </p>
              <p className="mt-4 text-sm text-ink-muted">
                Grounded retrieval means the analyst answers from your pages only — no invented
                clauses, no imagined figures.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="ink-panel flex flex-col items-start gap-6 rounded-2xl px-8 py-12 sm:px-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-ink-foreground sm:text-3xl">
                Put your first document to work
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Free to start. No card required while you evaluate.
              </p>
            </div>
            <Button asChild size="lg" variant="gold">
              <Link to="/auth" search={{ mode: "signup", redirect: undefined }}>
                Create your account <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <Logo compact />
          <p>© {new Date().getFullYear()} OmniParse AI. Document intelligence for teams.</p>
        </div>
      </footer>
    </div>
  );
}
