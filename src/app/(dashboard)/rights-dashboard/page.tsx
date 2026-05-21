'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getLanguages,
  getRightsModeStats,
  getActiveInternetTitlesCount,
  type RightsModeStats,
} from '@/lib/api/dashboard'
import { getPendingMovies } from '@/lib/api/approvals'
import { useAuth } from '@/contexts/auth-context'
import { InternetDashboardTable } from '@/components/dashboard/internet-dashboard-table'
import { SatelliteDashboardTable } from '@/components/dashboard/satellite-dashboard-table'
import { AnimatedCounter } from '@/components/dashboard/animated-counter'
import {
  Globe,
  Film,
  Calendar,
  Activity,
  TrendingUp,
  Clock,
  Star,
  Satellite,
  Languages,
  ArrowLeft,
  Maximize2,
  Gavel,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAppToast } from "@/hooks/use-app-toast";

type DashboardMode = 'satellite' | 'internet'

// ─── Satellite card types ────────────────────────────────────────────────────
type SatActiveCard = 'open_titles' | 'expiring' | 'wtp'
// ─── Internet card types ─────────────────────────────────────────────────────
type IntActiveCard = 'open_titles' | 'expiring' | 'active'

export default function RightsDashboardPage() {
  const { profile } = useAuth()
  const isLegalOrAdmin = profile?.role === 'legal' || profile?.role === 'admin'

  const [mode, setMode] = useState<DashboardMode>('satellite')
  const [fullPageView, setFullPageView] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // ── shared ──
  const [languages, setLanguages] = useState<string[]>([])
  const [language, setLanguage] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const toast = useAppToast();
  const [statsLoading, setStatsLoading] = useState(false)

  // ── satellite state ──
  const [satStats, setSatStats] = useState<RightsModeStats | null>(null)
  const [satActiveCard, setSatActiveCard] = useState<SatActiveCard>('open_titles')

  // ── internet state ──
  const [intStats, setIntStats] = useState<RightsModeStats | null>(null)
  const [intActiveCount, setIntActiveCount] = useState<{ total: number; home: number; acquired: number }>({ total: 0, home: 0, acquired: 0 })
  const [intActiveCard, setIntActiveCard] = useState<IntActiveCard>('open_titles')

  // ── expiry filters (per-mode) ──
  const [satExpiryYear, setSatExpiryYear] = useState<string>('all')
  const [satExpiryFrom, setSatExpiryFrom] = useState<string>('')
  const [satExpiryTo, setSatExpiryTo] = useState<string>('')

  const [intExpiryYear, setIntExpiryYear] = useState<string>('all')
  const [intExpiryFrom, setIntExpiryFrom] = useState<string>('')
  const [intExpiryTo, setIntExpiryTo] = useState<string>('')

  // Load pending approvals count for legal/admin banner
  useEffect(() => {
    if (!isLegalOrAdmin) return
    getPendingMovies({ status: 'pending', limit: 1 }).then(({ count }) => setPendingCount(count)).catch(() => {})
  }, [isLegalOrAdmin])

  // Initial load
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
            const langs = await getLanguages()
        setLanguages(langs)

        const bengali = langs.find((l) => l.toLowerCase() === 'bengali')
        const defaultLang = bengali ?? ''
        if (defaultLang) setLanguage(defaultLang)

        const [satS, intS, ac] = await Promise.all([
          getRightsModeStats('satellite', defaultLang || undefined),
          getRightsModeStats('internet', defaultLang || undefined),
          getActiveInternetTitlesCount(defaultLang || undefined),
        ])
        setSatStats(satS)
        setIntStats(intS)
        setIntActiveCount(ac)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleLanguageChange = useCallback(async (val: string) => {
    const newLang = val === 'all' ? '' : val
    setLanguage(newLang)
    setStatsLoading(true)
    try {
      const langParam = newLang || undefined
      const [satS, intS, ac] = await Promise.all([
        getRightsModeStats('satellite', langParam),
        getRightsModeStats('internet', langParam),
        getActiveInternetTitlesCount(langParam),
      ])
      setSatStats(satS)
      setIntStats(intS)
      setIntActiveCount(ac)
    } catch (err) {
      console.error('Failed to refresh stats', err)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const handleSatYearChange = useCallback((year: string) => {
    setSatExpiryYear(year)
    if (year === 'all') { setSatExpiryFrom(''); setSatExpiryTo('') }
    else { setSatExpiryFrom(`${year}-01-01`); setSatExpiryTo(`${year}-12-31`) }
  }, [])

  const handleIntYearChange = useCallback((year: string) => {
    setIntExpiryYear(year)
    if (year === 'all') { setIntExpiryFrom(''); setIntExpiryTo('') }
    else { setIntExpiryFrom(`${year}-01-01`); setIntExpiryTo(`${year}-12-31`) }
  }, [])

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 1 + i)

  // ─── Satellite stat cards config ─────────────────────────────────────────
  const satStatsConfig = [
    {
      id: 'open_titles' as SatActiveCard,
      title: 'Open Titles',
      value: satStats?.openTitlesCount ?? 0,
      subValues: [
        { label: 'Home', value: satStats?.openHomeTitlesCount ?? 0 },
        { label: 'Acquired', value: satStats?.openAcquiredTitlesCount ?? 0 },
      ],
      description: 'Movies with no satellite rights',
      icon: Film,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-500/10 to-cyan-500/5',
      border: 'border-cyan-500/40',
      glow: 'glow-cyan',
    },
    {
      id: 'expiring' as SatActiveCard,
      title: 'Expiring Satellite Rights',
      value: satStats?.expiringRightsCount ?? 0,
      description: 'Satellite rights expiring this year',
      icon: Clock,
      color: 'text-orange-400',
      bgGradient: 'from-orange-500/10 to-orange-500/5',
      border: 'border-orange-500/40',
      glow: '',
    },
    {
      id: 'wtp' as SatActiveCard,
      title: 'WTP',
      value: satStats?.wtpCount ?? 0,
      description: 'World Television Premiere titles',
      icon: Star,
      color: 'text-purple-400',
      bgGradient: 'from-purple-500/10 to-purple-500/5',
      border: 'border-purple-500/40',
      glow: 'glow-purple',
    },
  ] as const

  // ─── Internet stat cards config ───────────────────────────────────────────
  const intStatsConfig = [
    {
      id: 'open_titles' as IntActiveCard,
      title: 'Open Internet Titles',
      value: intStats?.openTitlesCount ?? 0,
      subValues: [
        { label: 'Home', value: intStats?.openHomeTitlesCount ?? 0 },
        { label: 'Acquired', value: intStats?.openAcquiredTitlesCount ?? 0 },
      ],
      description: 'Movies with no active internet/SVOD rights',
      icon: Film,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-500/10 to-cyan-500/5',
      border: 'border-cyan-500/40',
      glow: 'glow-cyan',
    },
    {
      id: 'expiring' as IntActiveCard,
      title: 'Expiring Internet Rights',
      value: intStats?.expiringRightsCount ?? 0,
      description: 'Internet rights expiring this year',
      icon: Calendar,
      color: 'text-orange-400',
      bgGradient: 'from-orange-500/10 to-orange-500/5',
      border: 'border-orange-500/40',
      glow: '',
    },
    {
      id: 'active' as IntActiveCard,
      title: 'Active Internet Rights',
      value: intActiveCount.total,
      subValues: [
        { label: 'Home', value: intActiveCount.home },
        { label: 'Acquired', value: intActiveCount.acquired },
      ],
      description: 'Movies with currently active internet/SVOD rights',
      icon: Activity,
      color: 'text-emerald-400',
      bgGradient: 'from-emerald-500/10 to-emerald-500/5',
      border: 'border-emerald-500/40',
      glow: 'glow-emerald',
    },
  ] as const

  const isSatellite = mode === 'satellite'
  const statsConfig = isSatellite ? satStatsConfig : intStatsConfig
  const activeCard = isSatellite ? satActiveCard : intActiveCard
  const setActiveCard = (id: string) => {
    if (isSatellite) {
      setSatActiveCard(id as SatActiveCard)
      if (id === 'expiring' && satExpiryYear === 'all') handleSatYearChange(String(currentYear))
    } else {
      setIntActiveCard(id as IntActiveCard)
      if (id === 'expiring' && intExpiryYear === 'all') handleIntYearChange(String(currentYear))
    }
    setFullPageView(true)
  }

  // ── Active stat label for full-page header ──
  const activeStatConfig = statsConfig.find((s) => s.id === activeCard)

  if (fullPageView) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Full-page top bar */}
        <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/60 backdrop-blur-md ${isSatellite
          ? 'bg-gradient-to-r from-slate-950 via-slate-900/80 to-purple-950/20'
          : 'bg-gradient-to-r from-slate-950 via-slate-900/80 to-blue-950/20'
          }`}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            onClick={() => setFullPageView(false)}
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
          <span className="text-slate-700">|</span>
          {activeStatConfig && (
            <div className="flex items-center gap-2">
              <activeStatConfig.icon className={`h-4 w-4 ${activeStatConfig.color}`} />
              <span className="text-sm font-semibold">{activeStatConfig.title}</span>
              <span className={`text-xs font-bold tabular-nums ${activeStatConfig.color}`}>
                {activeStatConfig.value.toLocaleString()}
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {isSatellite ? 'Satellite Rights' : 'Internet Rights'}
            </span>
            {/* Language selector */}
            <div className="flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <Select value={language || 'all'} onValueChange={handleLanguageChange} disabled={loading}>
                <SelectTrigger className="bg-slate-900/60 h-8 border-slate-800/60 text-xs w-32 text-slate-300">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {languages.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Full-page table */}
        <div className="flex-1 overflow-hidden">
          {isSatellite ? (
            <SatelliteDashboardTable
              activeCard={satActiveCard}
              languages={languages}
              language={language}
              onLanguageChange={setLanguage}
              expiryYear={satExpiryYear}
              onExpiryYearChange={handleSatYearChange}
              expiryFrom={satExpiryFrom}
              expiryTo={satExpiryTo}
              onExpiryFromChange={(v) => { setSatExpiryFrom(v); setSatExpiryYear('custom') }}
              onExpiryToChange={(v) => { setSatExpiryTo(v); setSatExpiryYear('custom') }}
              yearOptions={yearOptions}
              fullPage
            />
          ) : (
            <InternetDashboardTable
              activeCard={intActiveCard}
              languages={languages}
              language={language}
              onLanguageChange={setLanguage}
              expiryYear={intExpiryYear}
              onExpiryYearChange={handleIntYearChange}
              expiryFrom={intExpiryFrom}
              expiryTo={intExpiryTo}
              onExpiryFromChange={(v) => { setIntExpiryFrom(v); setIntExpiryYear('custom') }}
              onExpiryToChange={(v) => { setIntExpiryTo(v); setIntExpiryYear('custom') }}
              yearOptions={yearOptions}
              fullPage
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Pending approvals banner for legal/admin */}
      {isLegalOrAdmin && pendingCount > 0 && (
        <div className="relative z-10 bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
            <Gavel className="h-4 w-4 shrink-0" />
            {pendingCount} movie{pendingCount !== 1 ? 's' : ''} awaiting legal approval
          </div>
          <Link href="/legal-approvals" className="text-xs font-semibold text-yellow-300 hover:text-yellow-100 underline underline-offset-2 shrink-0">
            Review now →
          </Link>
        </div>
      )}

      {/* Ambient orbs */}
      <div className="absolute top-0 left-1/4 w-[700px] h-[400px] bg-purple-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-0 w-[500px] h-[300px] bg-red-600/3 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Header ── */}
      <div
        className={`relative overflow-hidden border-b border-slate-800/60 ${isSatellite
          ? 'bg-gradient-to-br from-slate-950 via-slate-900/70 to-purple-950/20'
          : 'bg-gradient-to-br from-slate-950 via-slate-900/70 to-blue-950/20'
          }`}
      >
        <div className="relative px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center gap-4">
              {/* Icon + Title */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`p-3 rounded-xl border shadow-lg ${isSatellite
                    ? 'bg-purple-500/15 border-purple-500/30 shadow-purple-500/10'
                    : 'bg-blue-500/15 border-blue-500/30 shadow-blue-500/10'
                    }`}
                >
                  {isSatellite
                    ? <Satellite className="h-6 w-6 text-purple-400" />
                    : <Globe className="h-6 w-6 text-blue-400" />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                    {isSatellite ? 'Satellite Rights Dashboard' : 'Internet Rights Dashboard'}
                  </h1>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {isSatellite
                      ? 'Monitor and manage your satellite broadcasting rights portfolio'
                      : 'Monitor and manage your internet / digital streaming rights portfolio'}
                  </p>
                </div>
              </div>

              {/* ── Language Selector ── */}
              <div className="flex items-center gap-1.5">
                <Languages className="h-4 w-4 text-slate-400 shrink-0" />
                <Select value={language || 'all'} onValueChange={handleLanguageChange} disabled={loading}>
                  <SelectTrigger className="bg-slate-900/60 h-9 border-slate-800/60 text-sm w-36 text-slate-300">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    {languages.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Mode Toggle ── */}
              <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800/60 rounded-xl p-1 backdrop-blur-sm">
                <button
                  onClick={() => setMode('satellite')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${isSatellite
                    ? 'bg-slate-800/80 border border-slate-700/60 shadow-lg shadow-purple-500/10 text-purple-400'
                    : 'text-slate-400 hover:text-slate-300'
                    }`}
                >
                  <Satellite className="h-3.5 w-3.5" />
                  Satellite
                </button>
                <button
                  onClick={() => setMode('internet')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${!isSatellite
                    ? 'bg-slate-800/80 border border-slate-700/60 shadow-lg shadow-blue-500/10 text-blue-400'
                    : 'text-slate-400 hover:text-slate-300'
                    }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Internet
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 relative z-10">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* ── Stat Cards ── */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {loading || statsLoading ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="glass-card animate-pulse">
                    <div className="p-6 space-y-3">
                      <div className="h-4 bg-slate-800/60 rounded w-1/2" />
                      <div className="h-8 bg-slate-800/60 rounded w-3/4" />
                      <div className="h-3 bg-slate-800/60 rounded w-full" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {statsConfig.map((stat, index) => {
                  const Icon = stat.icon
                  const isActive = activeCard === stat.id
                  return (
                    <Card
                      key={stat.id}
                      className={`relative glass-card transition-all duration-300 overflow-hidden group cursor-pointer ${'glow' in stat ? stat.glow : ''} ${isActive
                        ? `border-2 ${stat.border} shadow-lg`
                        : 'hover:border-slate-700/60 hover:-translate-y-0.5'
                        }`}
                      onClick={() => setActiveCard(stat.id)}
                    >
                      <div
                        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${stat.bgGradient} ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
                          } transition-opacity duration-300`}
                      />
                      <div className="relative p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className={`p-2.5 rounded-lg bg-gradient-to-br ${stat.bgGradient} border border-slate-700/30`}>
                            <Icon className={`h-5 w-5 ${stat.color}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Maximize2 className={`h-3.5 w-3.5 ${stat.color} opacity-0 group-hover:opacity-60 transition-opacity`} />
                            <TrendingUp className={`h-4 w-4 ${stat.color} opacity-60`} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-medium text-slate-400">{stat.title}</h3>
                          <span className="text-3xl font-bold tracking-tight block">
                            <AnimatedCounter value={stat.value} duration={800 + index * 100} />
                          </span>
                          {'subValues' in stat && (
                            <div className="flex gap-3 pt-0.5">
                              {stat.subValues.map((sv) => (
                                <span key={sv.label} className="text-xs text-slate-400">
                                  <span className="font-semibold text-foreground/70">{sv.value}</span> {sv.label}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-slate-400 pt-0.5">{stat.description}</p>
                        </div>
                        <div className={`mt-3 text-xs font-medium ${stat.color} opacity-0 group-hover:opacity-80 transition-opacity flex items-center gap-1`}>
                          <Maximize2 className="h-3 w-3" /> Click to open full view
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Table (preview below cards) ── */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
            {isSatellite ? (
              <SatelliteDashboardTable
                activeCard={satActiveCard}
                languages={languages}
                language={language}
                onLanguageChange={setLanguage}
                expiryYear={satExpiryYear}
                onExpiryYearChange={handleSatYearChange}
                expiryFrom={satExpiryFrom}
                expiryTo={satExpiryTo}
                onExpiryFromChange={(v) => { setSatExpiryFrom(v); setSatExpiryYear('custom') }}
                onExpiryToChange={(v) => { setSatExpiryTo(v); setSatExpiryYear('custom') }}
                yearOptions={yearOptions}
              />
            ) : (
              <InternetDashboardTable
                activeCard={intActiveCard}
                languages={languages}
                language={language}
                onLanguageChange={setLanguage}
                expiryYear={intExpiryYear}
                onExpiryYearChange={handleIntYearChange}
                expiryFrom={intExpiryFrom}
                expiryTo={intExpiryTo}
                onExpiryFromChange={(v) => { setIntExpiryFrom(v); setIntExpiryYear('custom') }}
                onExpiryToChange={(v) => { setIntExpiryTo(v); setIntExpiryYear('custom') }}
                yearOptions={yearOptions}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
