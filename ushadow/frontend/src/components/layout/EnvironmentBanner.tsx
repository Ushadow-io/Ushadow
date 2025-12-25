interface EnvironmentBannerProps {
  className?: string
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  red: { 
    bg: 'bg-red-100 dark:bg-red-900/20', 
    text: 'text-red-800 dark:text-red-300',
    border: 'border-red-500'
  },
  blue: { 
    bg: 'bg-blue-100 dark:bg-blue-900/20', 
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-500'
  },
  green: { 
    bg: 'bg-green-100 dark:bg-green-900/20', 
    text: 'text-green-800 dark:text-green-300',
    border: 'border-green-500'
  },
  yellow: { 
    bg: 'bg-yellow-100 dark:bg-yellow-900/20', 
    text: 'text-yellow-800 dark:text-yellow-300',
    border: 'border-yellow-500'
  },
  purple: { 
    bg: 'bg-purple-100 dark:bg-purple-900/20', 
    text: 'text-purple-800 dark:text-purple-300',
    border: 'border-purple-500'
  },
  pink: { 
    bg: 'bg-pink-100 dark:bg-pink-900/20', 
    text: 'text-pink-800 dark:text-pink-300',
    border: 'border-pink-500'
  },
  orange: { 
    bg: 'bg-orange-100 dark:bg-orange-900/20', 
    text: 'text-orange-800 dark:text-orange-300',
    border: 'border-orange-500'
  },
  gold: { 
    bg: 'bg-amber-100 dark:bg-amber-900/20', 
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-500'
  },
}

export default function EnvironmentBanner({ className = '' }: EnvironmentBannerProps) {
  const envName = import.meta.env.VITE_ENV_NAME as string | undefined
  const nodeEnv = import.meta.env.MODE
  
  // Only show in development mode and if env name is set
  if (nodeEnv !== 'development' || !envName) {
    return null
  }

  const normalizedEnv = envName.toLowerCase()
  const colorTheme = COLOR_MAP[normalizedEnv]
  
  const bgClass = colorTheme?.bg || 'bg-gray-100 dark:bg-gray-900/20'
  const textClass = colorTheme?.text || 'text-gray-800 dark:text-gray-300'

  return (
    <div 
      className={`py-1.5 px-4 text-center text-sm font-medium ${bgClass} ${textClass} ${className}`}
      role="banner"
    >
      Development Environment: <span className="font-bold uppercase">{envName}</span>
    </div>
  )
}

export { COLOR_MAP }
