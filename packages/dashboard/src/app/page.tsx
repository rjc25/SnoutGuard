import Link from 'next/link';
import {
  Shield,
  GitBranch,
  BarChart3,
  Brain,
  ArrowRight,
  CheckCircle2,
  Zap,
  Eye,
  Network,
} from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Decision Discovery',
    description:
      'Automatically infer architectural decisions from your codebase using LLM analysis. No manual documentation required.',
  },
  {
    icon: Shield,
    title: 'Governance Enforcement',
    description:
      'Define architectural rules and constraints. Get real-time violation alerts during code reviews and CI/CD pipelines.',
  },
  {
    icon: BarChart3,
    title: 'Health Scoring & Metrics',
    description:
      'Track architectural health with composite scores across coupling, cohesion, complexity, and drift dimensions.',
  },
  {
    icon: Eye,
    title: 'Review Intelligence',
    description:
      'Enrich pull request reviews with architectural context. Surface relevant decisions and potential violations inline.',
  },
  {
    icon: GitBranch,
    title: 'Drift Detection',
    description:
      'Monitor your codebase for architectural drift over time. Catch deviations before they become technical debt.',
  },
  {
    icon: Network,
    title: 'Dependency Analysis',
    description:
      'Visualize and track dependency relationships. Identify circular dependencies and coupling hotspots.',
  },
];

const stats = [
  { label: 'Decisions Tracked', value: '50K+' },
  { label: 'Reviews Enriched', value: '200K+' },
  { label: 'Violations Caught', value: '35K+' },
  { label: 'Engineering Teams', value: '500+' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-7 w-7 text-brand-600" />
              <span className="text-xl font-bold text-gray-900">ArchGuard</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </a>
              <a href="#metrics" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Metrics
              </a>
              <a
                href="https://docs.archguard.dev"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Docs
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors px-3 py-2"
              >
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary text-sm">
                Get started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-purple-50" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
              <Zap className="h-3.5 w-3.5" />
              AI-Powered Architectural Governance
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
              Keep your architecture{' '}
              <span className="bg-gradient-to-r from-brand-600 to-purple-600 bg-clip-text text-transparent">
                healthy
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
              ArchGuard automatically discovers architectural decisions from your codebase, enforces governance rules in
              real-time, and tracks architectural health across your entire organization.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="btn-primary w-full sm:w-auto text-base px-8 py-3">
                Start for free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="btn-secondary w-full sm:w-auto text-base px-8 py-3"
              >
                Sign in to dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="metrics" className="border-y border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <dt className="text-sm font-medium text-gray-600">{stat.label}</dt>
                <dd className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need for architectural governance
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              From automated decision discovery to real-time enforcement, ArchGuard covers the full governance
              lifecycle.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-brand-200 hover:shadow-lg"
              >
                <div className="mb-4 inline-flex rounded-lg bg-brand-50 p-3 text-brand-600 ring-1 ring-brand-100 group-hover:bg-brand-100 transition-colors">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to govern your architecture?
            </h2>
            <p className="mt-4 text-lg text-brand-100">
              Get started in minutes. Connect your repositories and let ArchGuard do the rest.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3 text-base font-semibold text-brand-600 shadow-sm transition-colors hover:bg-brand-50"
              >
                Get started free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login/sso"
                className="inline-flex items-center justify-center rounded-lg px-8 py-3 text-base font-semibold text-brand-100 ring-1 ring-inset ring-brand-400 transition-colors hover:bg-brand-500"
              >
                Enterprise SSO
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-500">
                ArchGuard &copy; {new Date().getFullYear()}. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
