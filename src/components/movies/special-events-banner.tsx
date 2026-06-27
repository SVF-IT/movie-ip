'use client'

import { createClient } from '@/lib/supabase/client'
import { ChevronDown, Sparkles, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Anniversary {
  id: string
  title: string
  release_date: string
  years: number
  daysUntil: number
  anniversaryDate: Date
}

// ─── Milestone logic ──────────────────────────────────────────────────────────
const MILESTONES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75]

function getUpcomingAnniversaries(
  movies: { id: string; title: string; release_date: string }[],
  windowDays = 180
): Anniversary[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const results: Anniversary[] = []

  for (const m of movies) {
    if (!m.release_date) continue
    const rel = new Date(m.release_date + 'T00:00:00')
    if (isNaN(rel.getTime())) continue
    const baseYear = rel.getFullYear()

    for (const milestone of MILESTONES) {
      const anniv = new Date(baseYear + milestone, rel.getMonth(), rel.getDate())
      anniv.setHours(0, 0, 0, 0)
      const diff = Math.round((anniv.getTime() - todayMs) / 86400000)
      if (diff < 0 || diff > windowDays) continue
      results.push({
        id: m.id,
        title: m.title,
        release_date: m.release_date,
        years: milestone,
        daysUntil: diff,
        anniversaryDate: anniv,
      })
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 12)
}

// ─── Milestone helpers ────────────────────────────────────────────────────────
function milestoneLabel(y: number) {
  if (y === 1) return '1st Anniversary'
  if (y === 25) return 'Silver Jubilee'
  if (y === 50) return 'Golden Jubilee'
  if (y === 75) return 'Platinum Jubilee'
  return `${y}th Anniversary`
}

function milestoneIcon(y: number) {
  if (y === 50 || y === 75) return '🏆'
  if (y === 25) return '✦'
  return '★'
}

function milestoneStyle(y: number): { bg: string; color: string; border: string } {
  if (y >= 50) return { bg: 'oklch(0.78 0.14 55 / 0.25)', color: 'oklch(0.88 0.14 55)', border: 'oklch(0.78 0.14 55 / 0.5)' }
  if (y === 25) return { bg: 'oklch(0.74 0.08 250 / 0.22)', color: 'oklch(0.88 0.06 250)', border: 'oklch(0.74 0.08 250 / 0.45)' }
  if (y >= 15) return { bg: 'oklch(0.74 0.14 162 / 0.22)', color: 'oklch(0.84 0.14 162)', border: 'oklch(0.74 0.14 162 / 0.45)' }
  if (y === 1) return { bg: 'oklch(0.72 0.16 140 / 0.22)', color: 'oklch(0.84 0.16 140)', border: 'oklch(0.72 0.16 140 / 0.45)' }
  return { bg: 'oklch(0.65 0.16 230 / 0.22)', color: 'oklch(0.82 0.14 230)', border: 'oklch(0.65 0.16 230 / 0.45)' }
}

// ─── Countdown SVG ring ───────────────────────────────────────────────────────
function CountdownRing({ days, size = 72 }: { days: number; size?: number }) {
  const r = (size - 8) / 2
  const C = 2 * Math.PI * r
  const pct = Math.max(0.05, 1 - Math.min(days, 365) / 365)
  const hue = days < 60 ? 18 : days < 120 ? 55 : 162
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`oklch(0.78 0.18 ${hue})`} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={`${pct * C} ${C}`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: days > 99 ? 11 : 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>
          {days}d
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>away</div>
      </div>
    </div>
  )
}

// ─── Main banner ──────────────────────────────────────────────────────────────
export function SpecialEventsBanner({ preferenceEnabled }: { preferenceEnabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [closing, setClosing] = useState(false)
  const [movies, setMovies] = useState<{ id: string; title: string; release_date: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!preferenceEnabled) { setLoading(false); return }
    const supabase = createClient()
    supabase
      .from('movies')
      .select('id, title, release_date')
      .not('release_date', 'is', null)
      .eq('approval_status', 'approved')
      .then(({ data }: { data: any[] | null }) => {
        if (data) setMovies(data)
        setLoading(false)
      })
  }, [preferenceEnabled])

  const anniversaries = useMemo(() => getUpcomingAnniversaries(movies), [movies])

  const toggle = () => {
    if (open) {
      setClosing(true)
      setTimeout(() => { setRevealed(false); setOpen(false); setClosing(false) }, 680)
    } else {
      setOpen(true)
      setTimeout(() => setRevealed(true), 40)
    }
  }

  if (!preferenceEnabled || loading || anniversaries.length === 0) return null

  const todayAnnivs = anniversaries.filter(a => a.daysUntil === 0)
  const peek = anniversaries.slice(0, 2)

  return (
    <div style={{
      marginBottom: 12, borderRadius: 16, overflow: 'hidden',
      boxShadow: open
        ? '0 28px 60px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)'
        : '0 6px 24px -12px rgba(0,0,0,0.35)',
      transition: 'box-shadow .5s ease',
    }}>

      {/* ── BANNER STRIP ─────────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        style={{
          position: 'relative', width: '100%', padding: '0 22px',
          height: 64, display: 'flex', alignItems: 'center', gap: 16,
          cursor: 'pointer', border: 'none', background: 'none', overflow: 'hidden',
          borderBottom: open ? '1px solid rgba(255,255,255,0.07)' : 'none',
        }}
      >
        {/* velvet gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(110deg, oklch(0.22 0.07 18) 0%, oklch(0.18 0.05 300) 50%, oklch(0.14 0.04 240) 100%)',
        }} />
        {/* shimmer stripe overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.07,
          backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(255,255,255,0.6) 18px, rgba(255,255,255,0.6) 19px)',
        }} />
        {/* red glow left */}
        <div style={{
          position: 'absolute', left: -60, top: -30, width: 260, height: 120, borderRadius: '50%',
          background: 'radial-gradient(circle, oklch(0.55 0.19 18 / 0.38), transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* icon box */}
        <div style={{
          position: 'relative', width: 42, height: 42, flexShrink: 0, borderRadius: 11,
          background: 'oklch(0.55 0.19 18 / 0.2)', border: '1px solid oklch(0.65 0.18 18 / 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles style={{ width: 20, height: 20, color: 'oklch(0.84 0.16 18)' }} />
        </div>

        {/* text */}
        <div style={{ position: 'relative', flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: '0.01em' }}>
            Special Events
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.52)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {todayAnnivs.length > 0
              ? `🎉 ${todayAnnivs.map(a => a.title).join(', ')} — celebrating today!`
              : peek.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)' }}> · </span>}
                  <strong style={{ color: 'rgba(255,255,255,0.78)' }}>{e.title}</strong>
                  {' '}{milestoneLabel(e.years)} in {e.daysUntil}d
                </span>
              ))}
          </div>
        </div>

        {/* count pill */}
        <div style={{
          position: 'relative', flexShrink: 0,
          padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: 'oklch(0.55 0.19 18 / 0.22)', border: '1px solid oklch(0.65 0.18 18 / 0.35)',
          color: 'oklch(0.84 0.16 18)',
        }}>
          {anniversaries.length} upcoming
        </div>

        {/* chevron */}
        <ChevronDown style={{
          position: 'relative', width: 18, height: 18, color: 'rgba(255,255,255,0.45)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .5s cubic-bezier(.16,1,.3,1)',
        }} />
      </button>

      {/* ── CURTAIN PANEL ────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(170deg, oklch(0.18 0.06 18) 0%, oklch(0.15 0.04 290) 50%, oklch(0.12 0.03 240) 100%)',
        }}>

          {/* LEFT curtain leaf */}
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', zIndex: 10,
            background: 'linear-gradient(105deg, oklch(0.28 0.09 18) 0%, oklch(0.22 0.07 18) 100%)',
            transformOrigin: 'left center',
            transform: revealed && !closing ? 'translateX(-100%)' : 'translateX(0)',
            transition: 'transform 0.7s cubic-bezier(0.76,0,0.24,1)',
            pointerEvents: 'none',
            boxShadow: 'inset -8px 0 24px rgba(0,0,0,0.3)',
          }}>
            {[20, 40, 60, 80].map(p => (
              <div key={p} style={{
                position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02), rgba(255,255,255,0.06))',
              }} />
            ))}
          </div>

          {/* RIGHT curtain leaf */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', zIndex: 10,
            background: 'linear-gradient(255deg, oklch(0.28 0.09 18) 0%, oklch(0.22 0.07 18) 100%)',
            transformOrigin: 'right center',
            transform: revealed && !closing ? 'translateX(100%)' : 'translateX(0)',
            transition: 'transform 0.7s cubic-bezier(0.76,0,0.24,1)',
            pointerEvents: 'none',
            boxShadow: 'inset 8px 0 24px rgba(0,0,0,0.3)',
          }}>
            {[20, 40, 60, 80].map(p => (
              <div key={p} style={{
                position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02), rgba(255,255,255,0.06))',
              }} />
            ))}
          </div>

          {/* ── CONTENT ── */}
          <div style={{
            padding: '26px 22px 28px',
            opacity: revealed && !closing ? 1 : 0,
            transform: revealed && !closing ? 'none' : 'translateY(10px)',
            transition: 'opacity 0.4s 0.32s ease, transform 0.4s 0.32s ease',
          }}>

            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Sparkles style={{ width: 14, height: 14, color: 'oklch(0.82 0.16 18)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                Upcoming Anniversaries
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>
                next 180 days
              </span>
            </div>

            {/* Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
              gap: 14,
            }}>
              {anniversaries.map((a) => {
                const ms = milestoneStyle(a.years)
                const isImminent = a.daysUntil < 90
                const isSoon = a.daysUntil < 270
                const rel = new Date(a.release_date + 'T00:00:00')
                const dateStr = a.anniversaryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                const origYear = rel.getFullYear()

                return (
                  <Link
                    key={`${a.id}-${a.years}`}
                    href={`/movies/${a.id}`}
                    style={{
                      display: 'flex', gap: 14, padding: 14, borderRadius: 13, textDecoration: 'none',
                      background: `rgba(255,255,255,${isImminent ? '0.09' : '0.05'})`,
                      border: `1px solid rgba(255,255,255,${isImminent ? '0.13' : '0.07'})`,
                      boxShadow: isImminent ? '0 0 0 1px rgba(255,255,255,0.06), inset 0 0 40px rgba(255,255,255,0.015)' : 'none',
                      position: 'relative', overflow: 'hidden',
                      transition: 'background .2s, transform .2s, box-shadow .2s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = 'rgba(255,255,255,0.13)'
                      el.style.transform = 'translateY(-2px)'
                      el.style.boxShadow = '0 12px 32px -12px rgba(0,0,0,0.5)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = `rgba(255,255,255,${isImminent ? '0.09' : '0.05'})`
                      el.style.transform = 'none'
                      el.style.boxShadow = isImminent ? '0 0 0 1px rgba(255,255,255,0.06)' : 'none'
                    }}
                  >
                    {/* imminent radial glow */}
                    {isImminent && (
                      <div style={{
                        position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%',
                        background: 'radial-gradient(circle, oklch(0.65 0.18 18 / 0.25), transparent 70%)',
                        pointerEvents: 'none',
                      }} />
                    )}

                    {/* left: title block */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>

                      {/* milestone badge */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                        padding: '3px 8px', borderRadius: 999,
                        background: ms.bg, border: `1px solid ${ms.border}`,
                        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', color: ms.color,
                      }}>
                        {milestoneIcon(a.years)} {milestoneLabel(a.years)}
                      </div>

                      {/* title */}
                      <div style={{ fontSize: 15, lineHeight: 1.2, color: 'white', fontWeight: 600 }}>
                        {a.title}
                      </div>

                      {/* original release year + anniversary date */}
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                        Released {origYear} · {dateStr}
                      </div>

                      {/* distance label */}
                      <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                        {a.daysUntil === 0
                          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.84 0.18 18)' }}>🎉 Celebrating today!</span>
                          : isImminent
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.82 0.16 18)' }}>⚡ {a.daysUntil} days away</span>
                            : isSoon
                              ? <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                                {a.daysUntil}d · ~{Math.round(a.daysUntil / 30)}mo away
                              </span>
                              : <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                ~{Math.round(a.daysUntil / 30)}mo away
                              </span>
                        }
                      </div>
                    </div>

                    {/* right: countdown ring (imminent only) */}
                    {isImminent && <CountdownRing days={a.daysUntil} size={68} />}
                  </Link>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}>
              <Star style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>
                Showing 1st, 5-year milestones, and jubilees within 180 days. Manage in{' '}
                <Link href="/settings/notifications" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  onClick={e => e.stopPropagation()}>
                  Notification Settings
                </Link>.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
