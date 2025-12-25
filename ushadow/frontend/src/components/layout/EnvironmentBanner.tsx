interface EnvironmentBannerProps {
  className?: string
}

// Valid Tailwind color names
export const VALID_COLORS = [
  'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 
  'amber', 'lime', 'emerald', 'teal', 'cyan', 'sky', 'indigo', 
  'violet', 'fuchsia', 'rose'
]

// Helper to get color classes or default
export function getColorClasses(envName: string | undefined) {
  if (!envName) {
    return {
      bg: 'bg-gray-100 dark:bg-gray-900/20',
      text: 'text-gray-800 dark:text-gray-300',
      border: 'border-gray-500'
    }
  }

  const normalizedEnv = envName.toLowerCase()
  const color = VALID_COLORS.includes(normalizedEnv) ? normalizedEnv : 'gray'
  
  return {
    bg: `bg-${color}-100 dark:bg-${color}-900/20`,
    text: `text-${color}-800 dark:text-${color}-300`,
    border: `border-${color}-500`
  }
}

export default function EnvironmentBanner({ className = '' }: EnvironmentBannerProps) {
  const envName = import.meta.env.VITE_ENV_NAME as string | undefined
  const nodeEnv = import.meta.env.MODE
  
  // Only show in development mode and if env name is set
  if (nodeEnv !== 'development' || !envName) {
    return null
  }

  const { bg, text } = getColorClasses(envName)

  return (
    <div 
      className={`py-1.5 px-4 text-center text-sm font-medium ${bg} ${text} ${className}`}
      role="banner"
    >
      Development Environment: <span className="font-bold uppercase">{envName}</span>
    </div>
  )
}
