'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Shield, Github, Mail, Lock, User, Building2, Loader2 } from 'lucide-react';
import { signup, initiateOAuthLogin } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    try {
      await signup({ name, email, password, orgName: orgName || undefined });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-12 text-white">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-brand-300" />
          <span className="text-2xl font-bold">ArchGuard</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Start governing your
            <br />
            architecture today.
          </h2>
          <p className="mt-4 text-lg text-brand-200 max-w-md">
            Join hundreds of engineering teams that use ArchGuard to maintain healthy, well-governed software
            architectures.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { value: '5 min', label: 'Setup time' },
              { value: 'Free', label: 'To get started' },
              { value: 'Unlimited', label: 'Repositories' },
              { value: '24/7', label: 'Monitoring' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-brand-800/50 p-4">
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-brand-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-brand-400">
          &copy; {new Date().getFullYear()} ArchGuard. All rights reserved.
        </p>
      </div>

      {/* Right panel - signup form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Shield className="h-7 w-7 text-brand-600" />
            <span className="text-xl font-bold text-gray-900">ArchGuard</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-600">
            Get started with ArchGuard in minutes.
          </p>

          {/* OAuth buttons */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => initiateOAuthLogin('github')}
              className="btn-secondary gap-2"
            >
              <Github className="h-4 w-4" />
              GitHub
            </button>
            <button
              type="button"
              onClick={() => initiateOAuthLogin('google')}
              className="btn-secondary gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-gray-500">or sign up with email</span>
            </div>
          </div>

          {/* Signup form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Full name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters.</p>
            </div>

            <div>
              <label htmlFor="org" className="block text-sm font-medium text-gray-700 mb-1.5">
                Organization name
                <span className="ml-1 text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="org"
                  type="text"
                  autoComplete="organization"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>

            <p className="text-xs text-center text-gray-500">
              By creating an account, you agree to our{' '}
              <a href="#" className="text-brand-600 hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-brand-600 hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
