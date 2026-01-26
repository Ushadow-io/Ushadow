import { Radio } from 'lucide-react'
import ChronicleRecording from '../components/chronicle/ChronicleRecording'
import { useChronicle } from '../contexts/ChronicleContext'

export default function RecordingPage() {
  // Get recording from context (shared with Layout header button)
  const { recording } = useChronicle()

  return (
    <div className="space-y-6" data-testid="recording-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Radio className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Recording</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Record audio to Chronicle, Mycelia, or other wired destinations
          </p>
        </div>
      </div>

      {/* Recording Component */}
      <ChronicleRecording recording={recording} />
    </div>
  )
}
