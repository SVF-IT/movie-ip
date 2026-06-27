'use client'

import { AnimatedCounter } from '@/components/dashboard/animated-counter'
import { InternetDashboardTable } from '@/components/dashboard/internet-dashboard-table'
import { SatelliteDashboardTable } from '@/components/dashboard/satellite-dashboard-table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/auth-context'
import { useAppToast } from "@/hooks/use-app-toast"
import { getPendingMovies } from '@/lib/api/approvals'
import {
  getActiveInternetTitlesCount,
  getLanguages,
  getRightsModeStats,
  type RightsModeStats,
} from '@/lib/api/dashboard'
import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  Film,
  Gavel,
  Globe,
  Languages,
  Maximize2,
  Satellite,
  Star
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

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
    getPendingMovies({ status: 'pending', limit: 1 }).then(({ count }) => setPendingCount(count)).catch(() => { })
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
      description: 'Movies with no active rights',
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
      title: 'World Television Premieres',
      value: satStats?.wtpCount ?? 0,
      description: 'Movies with no satellite rights',
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
      <div className="flex flex-col -m-4 md:-m-8" style={{ minHeight: "calc(100vh - 4rem)" }}>
        {/* Full-page top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-(--svf-border) backdrop-blur-md"
          style={{ background: `color-mix(in oklch, var(--bg-deep) 85%, ${isSatellite ? 'oklch(0.42 0.18 290)' : 'oklch(0.42 0.15 240)'} 6%)` }}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
            onClick={() => setFullPageView(false)}
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
          <span style={{ color: "var(--svf-border-strong)" }}>|</span>
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
            <span className="text-xs text-(--text-faint)">
              {isSatellite ? 'Satellite Rights' : 'Internet Rights'}
            </span>
            {/* Language selector */}
            <div className="flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-(--text-faint) shrink-0" />
              <Select value={language || 'all'} onValueChange={handleLanguageChange} disabled={loading}>
                <SelectTrigger className="bg-(--bg-raise)/40 h-8 border-(--svf-border) text-xs w-32 text-(--text)">
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
              language={language}
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
              language={language}
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

  // color maps matching the design screenshot
  const cardColors: Record<string, { color: string; border: string; bg: string; dot: string }> = {
    'text-cyan-400': { color: 'var(--st-open)', border: 'color-mix(in oklch, var(--st-open) 40%, transparent)', bg: 'color-mix(in oklch, var(--st-open) 13%, transparent)', dot: 'var(--st-open)' },
    'text-orange-400': { color: 'var(--st-expiring)', border: 'color-mix(in oklch, var(--st-expiring) 40%, transparent)', bg: 'color-mix(in oklch, var(--st-expiring) 13%, transparent)', dot: 'var(--st-expiring)' },
    'text-purple-400': { color: 'var(--st-wtp)', border: 'color-mix(in oklch, var(--st-wtp) 40%, transparent)', bg: 'color-mix(in oklch, var(--st-wtp) 13%, transparent)', dot: 'var(--st-wtp)' },
    'text-emerald-400': { color: 'var(--st-active)', border: 'color-mix(in oklch, var(--st-active) 40%, transparent)', bg: 'color-mix(in oklch, var(--st-active) 13%, transparent)', dot: 'var(--st-active)' },
  }

  return (
    <div className="space-y-4">
      {/* Pending approvals banner — unchanged */}
      {isLegalOrAdmin && pendingCount > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-[10px]"
          style={{ background: "color-mix(in oklch, var(--st-expiring) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--st-expiring) 28%, transparent)" }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--st-expiring)" }}>
            <Gavel className="h-4 w-4 shrink-0" />
            {pendingCount} movie{pendingCount !== 1 ? 's' : ''} awaiting legal approval
          </div>
          <Link href="/legal-approvals" className="text-xs font-semibold underline underline-offset-2 shrink-0" style={{ color: "var(--st-expiring)" }}>
            Review now →
          </Link>
        </div>
      )}

      {/* ── Toolbar: mode toggle + language + export ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Satellite / Internet segmented toggle */}
        <div style={{
          display: "inline-flex", gap: 3, padding: 4, borderRadius: 11,
          background: "var(--bg-deep)", border: "1px solid var(--svf-border)",
        }}>
          {([
            { v: 'satellite' as DashboardMode, icon: Satellite, label: 'Satellite' },
            { v: 'internet' as DashboardMode, icon: Globe, label: 'Internet' },
          ] as const).map(({ v, icon: Icon, label }) => {
            const on = mode === v
            return (
              <button key={v} onClick={() => setMode(v)} style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "7px 16px", borderRadius: 8, cursor: "pointer",
                fontSize: 13.5, fontWeight: 600,
                border: on ? "1px solid var(--svf-border-strong)" : "1px solid transparent",
                background: on ? "var(--bg-raise)" : "transparent",
                color: on ? (v === 'satellite' ? "var(--st-wtp)" : "var(--st-open)") : "var(--text-faint)",
                boxShadow: on ? "0 3px 10px -4px hsl(0deg 0% 0% / 0.5)" : "none",
                transition: "all .2s ease",
              }}>
                <Icon style={{ width: 15, height: 15 }} />
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Language selector */}
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 shrink-0" style={{ color: "var(--text-faint)" }} />
          <Select value={language || 'all'} onValueChange={handleLanguageChange} disabled={loading}>
            <SelectTrigger className="h-9 w-36 bg-(--bg-raise)/40 border-(--svf-border) text-(--text)">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

      </div>

      {/* ── Stat Cards ── */}
      {loading || statsLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card animate-pulse" style={{ padding: 20, height: 160 }}>
              <div className="h-4 rounded w-1/2 mb-3" style={{ background: "var(--hover)" }} />
              <div className="h-10 rounded w-1/3 mb-2" style={{ background: "var(--hover)" }} />
              <div className="h-3 rounded w-3/4" style={{ background: "var(--hover)" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {statsConfig.map((stat, index) => {
            const Icon = stat.icon
            const isActive = activeCard === stat.id
            const c = cardColors[stat.color] ?? cardColors['text-cyan-400']
            return (
              <div
                key={stat.id}
                onClick={() => setActiveCard(stat.id)}
                style={{
                  position: "relative",
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 14,
                  cursor: "pointer",
                  background: "var(--panel)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  border: isActive ? `1.5px solid ${c.border}` : "1px solid var(--svf-border)",
                  boxShadow: isActive
                    ? `0 0 0 1px ${c.border}, 0 14px 40px -20px ${c.color}`
                    : "0 8px 24px -16px hsl(0deg 0% 0% / 0.4)",
                  transform: "none",
                  transition: "border .25s, box-shadow .25s, transform .25s cubic-bezier(.16,1,.3,1)",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "none" }}
              >
                {/* radial accent gradient */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: `radial-gradient(120% 120% at 100% 0%, ${c.bg}, transparent 55%)`,
                  opacity: isActive ? 1 : 0.5,
                  transition: "opacity .3s",
                  pointerEvents: "none",
                }} />
                <div style={{ position: "relative", padding: "var(--pad, 18px)" }}>
                  {/* icon + open label */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 11,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: c.color,
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                    }}>
                      <Icon style={{ width: 20, height: 20 }} />
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 11.5, fontWeight: 600,
                      color: c.color,
                      opacity: isActive ? 1 : 0,
                      transition: "opacity .2s",
                    }}>
                      <Maximize2 style={{ width: 13, height: 13 }} /> Open
                    </div>
                  </div>

                  {/* title */}
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)", marginBottom: 4 }}>
                    {stat.title}
                  </div>

                  {/* big number */}
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 42, lineHeight: 1, letterSpacing: "0.01em", color: "var(--text)" }}>
                    <AnimatedCounter value={stat.value} duration={800 + index * 100} />
                  </div>

                  {/* sub-values */}
                  {'subValues' in stat && (
                    <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                      {stat.subValues.map((sv) => (
                        <div key={sv.label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{sv.value}</span>
                          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{sv.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* description */}
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 'subValues' in stat ? 12 : 14, lineHeight: 1.4 }}>
                    {stat.description}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Table (preview below cards) — all logic unchanged ── */}
      <div>
        {isSatellite ? (
          <SatelliteDashboardTable
            activeCard={satActiveCard}
            language={language}
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
            language={language}
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
  )
}
