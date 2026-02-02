import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, GitBranch, Sparkles } from 'lucide-react'

interface BranchSelectorProps {
  branches: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  testId?: string
}

/**
 * Branch selector with autocomplete dropdown
 * Highlights Claude-created branches (starting with "claude/")
 */
export function BranchSelector({ branches, value, onChange, placeholder = 'Type or select branch...', testId = 'branch-selector' }: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredBranches, setFilteredBranches] = useState<string[]>(branches)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter branches based on input value
  useEffect(() => {
    if (value.trim() === '') {
      setFilteredBranches(branches)
    } else {
      const lowerValue = value.toLowerCase()
      setFilteredBranches(
        branches.filter(branch =>
          branch.toLowerCase().includes(lowerValue)
        )
      )
    }
  }, [value, branches])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setIsOpen(true)
  }

  const handleSelectBranch = (branch: string) => {
    onChange(branch)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const isClaudeBranch = (branch: string) => {
    return branch.startsWith('claude/')
  }

  // Sort branches: Claude branches first, then alphabetically
  const sortedBranches = [...filteredBranches].sort((a, b) => {
    const aIsClaude = isClaudeBranch(a)
    const bIsClaude = isClaudeBranch(b)

    if (aIsClaude && !bIsClaude) return -1
    if (!aIsClaude && bIsClaude) return 1
    return a.localeCompare(b)
  })

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          data-testid={testId}
          className="w-full px-3 py-2 pr-10 bg-surface-700 border border-surface-600 rounded-md
                     text-text-primary placeholder-text-muted focus:outline-none focus:ring-2
                     focus:ring-primary-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          data-testid={`${testId}-dropdown-toggle`}
        >
          <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && sortedBranches.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-surface-700 border border-surface-600 rounded-md shadow-lg max-h-64 overflow-y-auto"
          data-testid={`${testId}-dropdown`}
        >
          {sortedBranches.map((branch) => {
            const isClaude = isClaudeBranch(branch)
            return (
              <button
                key={branch}
                type="button"
                onClick={() => handleSelectBranch(branch)}
                data-testid={`${testId}-option-${branch}`}
                className={`w-full px-3 py-2 text-left hover:bg-surface-600 flex items-center gap-2
                           ${branch === value ? 'bg-surface-600' : ''}`}
              >
                {isClaude ? (
                  <Sparkles className="w-4 h-4 text-primary-400 flex-shrink-0" />
                ) : (
                  <GitBranch className="w-4 h-4 text-text-muted flex-shrink-0" />
                )}
                <span className={`flex-1 ${isClaude ? 'text-primary-300 font-medium' : 'text-text-primary'}`}>
                  {branch}
                </span>
                {isClaude && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300">
                    Claude
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {isOpen && filteredBranches.length === 0 && value.trim() !== '' && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-surface-700 border border-surface-600 rounded-md shadow-lg px-3 py-2"
          data-testid={`${testId}-no-results`}
        >
          <p className="text-text-muted text-sm">
            No branches match "{value}". Press Enter to create it.
          </p>
        </div>
      )}
    </div>
  )
}
