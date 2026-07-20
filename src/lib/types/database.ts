export type MovieSource = 'home_production' | 'acquired'
export type RightNature = string
export type CertificationType = string
export type UserRole = 'admin' | 'legal' | 'viewer' | 'editor'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface Movie {
  id: string
  title: string
  production_no?: string
  source: MovieSource
  release_date?: string
  release_year?: string
  certification?: CertificationType
  language?: string
  production_house_name?: string
  color_or_bw?: string
  trailer_link?: string
  poster_url?: string
  // Acquisition info
  assignor_licensor?: string
  licensee?: string
  agreement_date?: string
  agreement_start_date?: string
  agreement_end_date?: string
  // Clip rights (standalone — no nature/territory breakdown)
  clip_rights?: string
  clip_rights_duration?: string
  // Derivative / ancillary rights
  prequel_sequel_rights?: string
  character_rights?: string
  subtitling_rights?: string
  dubbing_rights?: string
  remarks?: string
  actionables?: string
  wtp_library?: string
  // Comma-separated list of platform/exploitation types permanently restricted
  // for this movie (e.g. "AVOD, FVOD") — takes precedence over any individual
  // platform_rights/movie_rights slot showing as available.
  syndication_holdback?: string
  jointly_owned?: boolean
  joint_prod_buy_back_date?: string
  revenue_share?: string
  jointly_exploitation_rights?: string
  home_sold?: boolean
  is_bangladeshi?: boolean
  recensor_flag?: boolean
  approval_status?: ApprovalStatus
  created_at?: string
  updated_at?: string
}

export interface MovieApproval {
  id: string
  movie_id: string
  status: ApprovalStatus
  reviewed_by?: string
  reviewer_name?: string
  reason?: string
  created_at?: string
  movie?: Movie
}

export interface MovieWithDetails extends Movie {
  cast_names?: string
  director_names?: string
}

// Grouped movie by production number with multiple language versions
export interface MovieLanguageVersion extends MovieWithDetails {
  is_primary?: boolean // The original/primary language version
}

export interface GroupedMovie {
  production_no: string
  title: string // Base title without language suffix
  source: MovieSource
  release_year?: string
  trailer_link?: string
  production_house_name?: string
  cast_names?: string
  director_names?: string
  certification?: CertificationType
  versions: MovieLanguageVersion[] // All language versions
  primary_version?: MovieLanguageVersion // The primary/original version
  total_versions: number
  total_rights: number
  expired_rights: number
  created_at?: string
}

export interface Person {
  id: string
  name: string
  role?: 'actor' | 'director' | 'both'
  created_at?: string
  updated_at?: string
}

export interface MoviePeople {
  id: string
  movie_id: string
  person_id: string
  role: 'Actor' | 'Director'
  billing_order?: number
  created_at?: string
  person?: Person
}

export interface Platform {
  id: string
  name: string
  platform_type?: string
  agreement_doc_url?: string
  created_at?: string
  updated_at?: string
}

export interface RightsNatureType {
  id: string
  name: string
  description?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export type MovieRightType = 'Satellite' | 'Internet' | 'Negative' | 'Airborne' | 'Ship' | 'Other'
export type MovieRightNature = 'Exclusive' | 'Non-Exclusive' | 'Shared Exclusive' | string

export interface MovieRight {
  id: string
  movie_id: string
  right_type: MovieRightType | string
  classification?: string
  nature?: MovieRightNature | null
  territory?: string
  start_date?: string
  end_date?: string
  syndication?: string
  holdbacks?: string
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
  // joined
  movie?: Pick<Movie, 'id' | 'title' | 'source'>
}

export interface PlatformRight {
  id: string
  movie_id: string
  platform_id?: string
  category?: string
  nature?: RightNature
  start_date?: string
  end_date?: string
  territory?: string
  is_current?: boolean
  holdbacks?: string
  remarks?: string
  created_at?: string
  updated_at?: string
}

export interface ExpiringRight extends PlatformRight {
  movie_title: string
  movie_source: MovieSource
  platform_name?: string
  rights_type_name?: string
  category?: string
  days_until_expiry: number
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  employee_id: string
  role: UserRole
  department?: string
  is_active?: boolean
  must_change_password?: boolean
  created_at?: string
  updated_at?: string
}

export interface DashboardStats {
  total_movies: number
  home_productions: number
  acquired_movies: number
  total_actors: number
  total_directors: number
  active_rights: number
  rights_expiring_30_days: number
  rights_expiring_90_days: number
  pending_approvals?: number
}

// Language and ProductionHouse tables were dropped. Data is now stored directly in movies table.
// However, a lookup table for production houses still exists for the directory.

export interface ProductionHouse {
  id: string
  name: string
  created_at?: string
  updated_at?: string
}

export interface MovieCast {
  id: string
  movie_id: string
  person_id: string
  role: string
  billing_order?: number
  person?: Person
}

export interface MovieDirector {
  id: string
  movie_id: string
  person_id: string
  person?: Person
}

// Analytics types
export interface AuditLogEntry {
  id: string
  user_id?: string
  action: string
  table_name: string
  record_id?: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  ip_address?: string
  created_at?: string
  user_email?: string
  user_full_name?: string
}

export interface ImportResult {
  success: number
  errors: { row: number; field?: string; message: string }[]
  total: number
}

export interface ImportConflict {
  row: number
  title: string
  existingId: string
}

export interface ComprehensiveImportResult {
  success: number
  skipped: number
  updated: number
  errors: { row: number; field?: string; message: string }[]
  total: number
  detectedFormat: 'home' | 'acquired' | 'unknown'
  stats: {
    moviesCreated: number
    castLinked: number
    directorsLinked: number
    platformRightsCreated: number
    peopleCreated: number
    productionHousesCreated: number
    platformsCreated: number
  }
}

export interface ImportConflictResponse {
  needsResolution: true
  conflicts: ImportConflict[]
}

export interface UserActivity {
  id: string
  user_id?: string
  action: string
  resource_type: string
  resource_id?: string
  metadata?: Record<string, unknown>
  created_at?: string
}

export interface RightsExpiryTimelinePoint {
  month: string
  expiring: number
  renewed: number
  transferred: number
}

export interface PlatformComparisonPoint {
  platform: string
  active: number
  expired: number
  total: number
}

export interface CatalogHealth {
  totalMovies: number
  withActiveRights: number
  withoutRights: number
  percentCovered: number
  metadataCompleteness: number
}

export interface DistributionPoint {
  name: string
  count: number
}

export interface MonthlyActivityPoint {
  month: string
  renewals: number
  expirations: number
  transfers: number
}

export interface RightsUtilizationMetrics {
  utilizationRate: number
  renewalRate: number
  averageDealDurationDays: number
  rightsVelocity: number
  platformConcentrationIndex: number
  totalExclusiveRights: number
  totalNonExclusiveRights: number
  exclusiveRatio: number
}

export interface PlatformConcentrationPoint {
  platform: string
  share: number
  count: number
  isTopConcentrated: boolean
}

export interface RightsWindowPoint {
  status: 'active' | 'upcoming' | 'expired_30d' | 'expired_90d'
  count: number
  label: string
}

export interface TopPerformingTitle {
  movieId: string
  title: string
  source: string
  activeRightsCount: number
  territories: number
  platforms: number
}

