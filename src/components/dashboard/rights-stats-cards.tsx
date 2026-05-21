'use client'

import { Card } from '@/components/ui/card'
import { TrendingUp, Film, Satellite, Calendar, Clapperboard } from 'lucide-react'
import { AnimatedCounter } from './animated-counter'

interface RightsStatsCardsProps {
  openTitlesCount: number
  wtpCount: number
  expiringRightsCount: number
  upcomingMoviesCount: number
  isLoading?: boolean
  onCardClick?: (category: 'all' | 'upcoming' | 'open_titles' | 'wtp') => void
}

export function RightsStatsCards({
  openTitlesCount,
  wtpCount,
  expiringRightsCount,
  upcomingMoviesCount,
  isLoading = false,
  onCardClick,
}: RightsStatsCardsProps) {
  const stats = [
    {
      id: 'open_titles',
      title: 'Open Titles',
      value: openTitlesCount,
      description: 'Movies without current rights',
      icon: Film,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-500/10 to-cyan-500/5',
      glowClass: 'glow-cyan',
    },
    {
      id: 'wtp',
      title: 'WTP',
      value: wtpCount,
      description: 'World Television Premiere',
      icon: Satellite,
      color: 'text-purple-400',
      bgGradient: 'from-purple-500/10 to-purple-500/5',
      glowClass: 'glow-purple',
    },
    {
      id: 'expiring',
      title: 'Expiring Rights',
      value: expiringRightsCount,
      description: 'Expiring in next 1 year',
      icon: Calendar,
      color: 'text-orange-400',
      bgGradient: 'from-orange-500/10 to-orange-500/5',
      glowClass: '',
    },
    {
      id: 'upcoming',
      title: 'Upcoming Movies',
      value: upcomingMoviesCount,
      description: 'Movies with future release dates',
      icon: Clapperboard,
      color: 'text-emerald-400',
      bgGradient: 'from-emerald-500/10 to-emerald-500/5',
      glowClass: '',
    },
  ] as const

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="glass-card animate-pulse">
            <div className="p-6 space-y-3">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <Card
            key={stat.title}
            className={`glass-card border-border/50 hover:border-border transition-all duration-300 overflow-hidden group ${stat.glowClass} ${stat.id !== 'expiring' ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (stat.id !== 'expiring' && onCardClick) {
                onCardClick(stat.id as 'upcoming' | 'open_titles' | 'wtp')
              }
            }}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-lg bg-gradient-to-br ${stat.bgGradient} border border-border/30`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <TrendingUp className={`h-4 w-4 ${stat.color} opacity-60`} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{stat.title}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">
                    <AnimatedCounter value={stat.value} duration={800 + index * 100} />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/80">{stat.description}</p>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
