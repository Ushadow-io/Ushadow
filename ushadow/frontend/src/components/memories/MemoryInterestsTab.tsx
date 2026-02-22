/**
 * MemoryInterestsTab
 *
 * Toggle between two interest derivation approaches:
 *  - "Feed-based"  : existing InterestExtractor (mem0 categories + Neo4j entity types)
 *  - "Graph-based" : new /api/v1/graph/interests (relationship-type scoring, depth-2)
 */

import { useState } from 'react'
import { RefreshCw, Tag, Loader2, AlertCircle, WifiOff, TriangleAlert } from 'lucide-react'
import { useFeedInterests, useRefreshFeed, useGraphInterests } from '../../hooks/useFeed'
import type { FeedInterest, GraphInterestItem, GraphUpcomingEvent } from '../../services/feedApi'

// ─── Shared: feed-based interest card ────────────────────────────────────────

function FeedInterestCard({ interest }: { interest: FeedInterest }) {
  const isEntity = interest.labels.includes('entity')
  const entityType = interest.labels.find((l) => l !== 'entity' && l !== 'category') ?? null
  const lastActive = interest.last_active
    ? new Date(interest.last_active).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div
      data-testid={`feed-interest-card-${interest.node_id}`}
      className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{interest.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {entityType && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300">{entityType}</span>
          )}
          <span className={`px-1.5 py-0.5 text-xs rounded ${isEntity ? 'bg-purple-500/20 text-purple-300' : 'bg-zinc-700 text-zinc-400'}`}>
            {isEntity ? 'entity' : 'category'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span>score <span className="text-white font-medium">{interest.relationship_count}</span></span>
        {lastActive && <span>active {lastActive}</span>}
      </div>
      {interest.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {interest.hashtags.map((tag) => (
            <span key={tag} data-testid={`feed-interest-tag-${interest.node_id}-${tag}`}
              className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300 font-mono">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Graph-based: interest / research item card ───────────────────────────────

function GraphItemCard({ item, testPrefix }: { item: GraphInterestItem; testPrefix: string }) {
  return (
    <div
      data-testid={`${testPrefix}-card-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{item.name}</span>
        <span className="px-1.5 py-0.5 text-xs rounded bg-zinc-700 text-zinc-400 shrink-0">{item.entity_type}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span>score <span className="text-white font-medium">{item.score.toFixed(1)}</span></span>
        <span>{item.mentions} mention{item.mentions !== 1 ? 's' : ''}</span>
        <span className="text-zinc-500">via <span className="text-zinc-300">{item.relationship}</span></span>
      </div>
      {item.all_types.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {item.all_types.map((t) => (
            <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-500 font-mono">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Graph-based: upcoming event row ─────────────────────────────────────────

function EventRow({ event }: { event: GraphUpcomingEvent }) {
  const start = new Date(event.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <div data-testid={`event-row-${event.memory_id}`}
      className="flex items-start gap-3 py-3 border-b border-zinc-800 last:border-0">
      <span className="text-xl shrink-0">{event.emoji ?? '📅'}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{event.name}</span>
          <span className="text-xs text-zinc-400 shrink-0">{start}</span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{event.memory_content}</p>
      </div>
    </div>
  )
}

// ─── Graph view ───────────────────────────────────────────────────────────────

function GraphInterestsView() {
  const { data, isLoading, isFetching, error, forceRefresh } = useGraphInterests()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {isLoading ? 'Loading…' : data
            ? `${data.interests.length} interests · ${data.research_topics.length} research · ${data.upcoming_events.length} events`
            : ''}
        </p>
        <button data-testid="graph-interests-refresh-btn"
          onClick={forceRefresh}
          disabled={isLoading || isFetching}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50 text-sm text-zinc-300">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {data && !data.graph_available && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          Neo4j unavailable — graph interests could not be computed.
        </div>
      )}

      {data?.unknown_rel_types.length ? (
        <div className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 text-sm">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Unknown relationship types (update RELATIONSHIP_CONFIG): {data.unknown_rel_types.join(', ')}</span>
        </div>
      ) : null}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {data && data.interests.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Interests</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.interests.map((item) => (
              <GraphItemCard key={item.name} item={item} testPrefix="graph-interest" />
            ))}
          </div>
        </section>
      )}

      {data && data.research_topics.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Research Topics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.research_topics.map((item) => (
              <GraphItemCard key={item.name} item={item} testPrefix="graph-research" />
            ))}
          </div>
        </section>
      )}

      {data && data.upcoming_events.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Upcoming Events</h3>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4">
            {data.upcoming_events.map((event) => (
              <EventRow key={event.memory_id} event={event} />
            ))}
          </div>
        </section>
      )}

      {data && !isLoading && data.interests.length === 0 && data.research_topics.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-zinc-800 rounded-full mb-4">
            <Tag className="w-8 h-8 text-zinc-500" />
          </div>
          <p className="text-zinc-400 text-sm">No interests found from graph relationships.</p>
        </div>
      )}
    </div>
  )
}

// ─── Feed view ────────────────────────────────────────────────────────────────

function FeedInterestsView() {
  const { interests, isLoading, error } = useFeedInterests()
  const { refresh, isRefreshing, lastResult } = useRefreshFeed()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {isLoading ? 'Loading…' : `${interests.length} interest${interests.length !== 1 ? 's' : ''} derived from your memories`}
        </p>
        <button data-testid="interests-refresh-btn"
          onClick={() => refresh()}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50 text-sm text-zinc-300">
          {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isRefreshing ? 'Refreshing…' : 'Refresh Interests'}
        </button>
      </div>

      {lastResult && (
        <div className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
          Refreshed — {lastResult.interests_count} interests, {lastResult.posts_new} new posts
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !error && interests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-zinc-800 rounded-full mb-4">
            <Tag className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No interests found</h3>
          <p className="text-zinc-400 text-sm">Add more memories so the system can derive your interests.</p>
        </div>
      )}

      {!isLoading && interests.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {interests.map((interest) => (
            <FeedInterestCard key={interest.node_id} interest={interest} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab root ─────────────────────────────────────────────────────────────────

type Source = 'feed' | 'graph'

export function MemoryInterestsTab() {
  const [source, setSource] = useState<Source>('feed')

  return (
    <div className="space-y-5">
      {/* Source toggle */}
      <div data-testid="interests-source-toggle" className="inline-flex rounded-lg border border-zinc-700 overflow-hidden">
        {(['feed', 'graph'] as const).map((s) => (
          <button
            key={s}
            data-testid={`interests-source-${s}`}
            onClick={() => setSource(s)}
            className={`px-4 py-2 text-sm transition-colors ${
              source === s
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {s === 'feed' ? 'Feed-based' : 'Graph-based'}
          </button>
        ))}
      </div>

      {source === 'feed' ? <FeedInterestsView /> : <GraphInterestsView />}
    </div>
  )
}
