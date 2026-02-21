import React from 'react'
import { Layers } from 'lucide-react'

interface AuthHeaderProps {
  subtitle: string
}

export default function AuthHeader({ subtitle }: AuthHeaderProps) {
  return (
    <>
      {/* Powered by Chronicle badge */}
      <div className="text-center">
        <a
          href="https://github.com/chronicler-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            color: 'var(--accent-300, #c4b5fd)',
          }}
          data-testid="chronicle-badge"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
          Powered with Chronicle
        </a>
      </div>

      {/* Logo & Header */}
      <div className="text-center animate-fade-in">
        <div className="mx-auto transform transition-transform hover:scale-105">
          <img
            src="/logo.png"
            alt="uShadow Logo"
            className="h-40 w-40 sm:h-56 sm:w-56 md:h-72 md:w-72 mx-auto object-contain drop-shadow-2xl"
            data-testid="auth-logo"
            onError={(e) => {
              // Fallback to icon if logo doesn't load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div
            className="hidden h-32 w-32 mx-auto rounded-2xl items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)' }}
          >
            <Layers className="h-16 w-16 text-white" />
          </div>
        </div>
        <h2
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight -mt-4 inline-block"
          style={{
            background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 35%, #a855f7 75%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          data-testid="auth-title"
        >
          Ushadow
        </h2>
        <p
          className="mt-3 text-base font-medium tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
          data-testid="auth-platform-label"
        >
          AI Orchestration Platform
        </p>
        <p
          className="mt-3 text-sm"
          style={{ color: 'var(--text-muted)' }}
          data-testid="auth-subtitle"
        >
          {subtitle}
        </p>
      </div>
    </>
  )
}
