import { Bug } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

const GITHUB_REPO = 'Ushadow-io/Ushadow'

/**
 * Builds a GitHub new issue URL with pre-filled title and body.
 */
function buildBugReportUrl(): string {
  const title = encodeURIComponent('Bug: ')
  const body = encodeURIComponent(`## Description
<!-- Describe the bug clearly and concisely -->

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
<!-- What did you expect to happen? -->

## Actual Behavior
<!-- What actually happened? -->

---
**Browser**: ${navigator.userAgent}
**URL**: ${window.location.href}
`)
  return `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${body}`
}

/**
 * Floating bug report button that appears in the lower-right corner.
 * Opens GitHub Issues with a pre-filled bug report template.
 */
export default function BugReportButton() {
  const { isDark } = useTheme()

  // Check if we're running inside the launcher (via query parameter)
  const isInLauncher = new URLSearchParams(window.location.search).has('launcher')

  // Don't render button when in launcher
  if (isInLauncher) {
    return null
  }

  return (
    <a
      href={buildBugReportUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl group"
      style={{
        backgroundColor: isDark ? 'var(--surface-700)' : 'white',
        border: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
        color: isDark ? 'var(--text-secondary)' : '#525252',
      }}
      data-testid="report-bug-button"
    >
      <Bug
        className="h-5 w-5 transition-colors group-hover:text-red-500"
      />
      <span className="text-sm font-medium">Report Bug</span>
    </a>
  )
}
