"use client";

import { ComprehensiveCSVImportDialog } from "@/components/import-export/comprehensive-csv-import-dialog";
import { DataExportDialog, type ExportFieldDef } from "@/components/import-export/data-export-dialog";
import { BulkPostersUploadDialog } from "@/components/movies/bulk-posters-upload-dialog";
import { RoleGate } from "@/components/role-gate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { getDistinctCertifications, getRightsNatureTypes } from "@/lib/api/dashboard";
import { getGroupedMovies, getLanguages } from "@/lib/api/movies";
import type { ApprovalStatus, GroupedMovie, MovieLanguageVersion, RightsNatureType } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronDown, ChevronLeft, ChevronRight,
  Download, Edit, ExternalLink, Film,
  Image as ImageIcon,
  Languages,
  LayoutGrid, Loader2, Plus, Search, Settings2, ShieldCheck,
  Upload
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function MoviesPage() {
  const { profile } = useAuth();
  const canSeeAllStatuses = profile?.role === "admin" || profile?.role === "legal";
  const canFilterByApproval = canSeeAllStatuses || profile?.role === "editor";

  const [movies, setMovies] = useState<GroupedMovie[]>([]);
  const [allFilteredMovies, setAllFilteredMovies] = useState<GroupedMovie[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "all">(
    canSeeAllStatuses ? "approved" : "all"
  );
  const [versionFilter, setVersionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();
  const [page, setPage] = useState(0);
  const [languages, setLanguages] = useState<string[]>([]);
  const [certificationFilter, setCertificationFilter] = useState<string[]>([]);
  const [certificationOptions, setCertificationOptions] = useState<string[]>([]);
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [territoryFilter, setTerritoryFilter] = useState<string>("");
  const [natureFilter, setNatureFilter] = useState<string>("all");
  const [natureTypes, setNatureTypes] = useState<RightsNatureType[]>([]);
  const [sortBy, setSortBy] = useState<'title_asc' | 'title_desc' | 'created_at_desc' | 'release_date_asc' | 'release_date_desc'>('title_asc');
  const [agreementExpiryYear, setAgreementExpiryYear] = useState<string>("all");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportMovieFormat, setExportMovieFormat] = useState<"home" | "acquired" | "all">("all");
  const [showBulkPostersDialog, setShowBulkPostersDialog] = useState(false);
  const pageSize = 50;

  const currentYear = new Date().getFullYear();
  const expiryYearOptions = Array.from({ length: 12 }, (_, i) => String(currentYear - 1 + i));

  useEffect(() => {
    getLanguages().then((langs) => {
      setLanguages(langs);
      const bengali = langs.find((l) => l.toLowerCase() === 'bengali');
      if (bengali) setLanguageFilter(bengali);
    }).catch(() => { });
    getRightsNatureTypes().then(setNatureTypes).catch(() => { });
    getDistinctCertifications().then((certs) => {
      const standardCerts = ['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S'];
      const dbCerts = certs.filter(c => c !== 'U/A');
      const merged = Array.from(new Set([...standardCerts, ...dbCerts]));
      setCertificationOptions(merged);
    }).catch(() => {
      setCertificationOptions(['U', 'UA', 'UA 7+', 'UA 13+', 'UA 16+', 'A', 'S']);
    });
  }, []);

  const fetchMovies = useCallback(async () => {
    try {
      setLoading(true);
  
      const source = (sourceFilter === "all" || sourceFilter === "jointly_owned") ? undefined : (sourceFilter as "home_production" | "acquired" | "expired");

      const { data: allGroupedData } = await getGroupedMovies({
        source,
        search: searchQuery || undefined,
        language: languageFilter !== "all" ? languageFilter : undefined,
        certification: certificationFilter.length > 0 ? certificationFilter : undefined,
        yearFrom: yearFrom ? new Date(yearFrom).getFullYear() : undefined,
        yearTo: yearTo ? new Date(yearTo).getFullYear() : undefined,
        territory: territoryFilter || undefined,
        natureOfRights: sourceFilter === "jointly_owned" ? "Jointly Owned" : (natureFilter !== "all" ? natureFilter : undefined),
        sortBy,
        approvalStatus: canFilterByApproval ? approvalFilter : "approved",
      });

      let filteredData = allGroupedData;

      if (versionFilter === "multi") {
        filteredData = filteredData.filter(m => m.total_versions > 1);
      } else if (versionFilter === "single") {
        filteredData = filteredData.filter(m => m.total_versions === 1);
      }

      if (agreementExpiryYear !== "all" && sourceFilter === "acquired") {
        const yearNum = parseInt(agreementExpiryYear);
        filteredData = filteredData.filter(m => {
          const endDate = m.primary_version?.agreement_end_date;
          if (!endDate) return false;
          return new Date(endDate).getFullYear() === yearNum;
        });
      }

      const totalFiltered = filteredData.length;
      const start = page * pageSize;
      const paginatedData = filteredData.slice(start, start + pageSize);

      setAllFilteredMovies(filteredData);
      setMovies(paginatedData);
      setTotalCount(totalFiltered);
    } catch (err) {
      console.error("Error fetching movies:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load movies");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sourceFilter, versionFilter, languageFilter, certificationFilter, yearFrom, yearTo, territoryFilter, natureFilter, sortBy, agreementExpiryYear, page, approvalFilter, canFilterByApproval]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  useEffect(() => {
    const timer = setTimeout(() => setPage(0), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSourceChange = (value: string) => {
    setSourceFilter(value);
    if (value === "home_production" || value === "expired" || value === "jointly_owned") {
      setAgreementExpiryYear("all");
    }
    setPage(0);
  };

  const hasFilters = searchQuery || sourceFilter !== "all" || versionFilter !== "all" || natureFilter !== "all"
    || languageFilter !== "all" || certificationFilter.length > 0 || yearFrom || yearTo || territoryFilter
    || agreementExpiryYear !== "all";

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getAgreementEndBadge = (dateStr?: string) => {
    if (!dateStr) return <span className="text-slate-400 text-xs">—</span>;
    const d = new Date(dateStr);
    const today = new Date();
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return (
      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs font-mono">
        {formatDate(dateStr)} <span className="ml-1 opacity-60">(exp)</span>
      </Badge>
    );
    if (days <= 90) return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-mono">
        {formatDate(dateStr)} <span className="ml-1 opacity-60">({days}d)</span>
      </Badge>
    );
    return (
      <Badge variant="outline" className="bg-slate-800/60 text-slate-400 border-slate-700/50 text-xs font-mono">
        {formatDate(dateStr)}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const showAgreementExpiry = sourceFilter === "acquired";
  const showJointProdCols = sourceFilter === "jointly_owned";
  const showBuyBackCol = sourceFilter === "jointly_owned" || natureFilter === "Jointly Owned";
  const showAgreementEndCol = sourceFilter !== "home_production" && sourceFilter !== "jointly_owned";
  const showMultiVersionCol = versionFilter === "multi";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-xl p-6 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-600 via-amber-500 to-transparent" />
        <div className="absolute top-4 right-4 w-48 h-48 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-2 right-24 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <Film className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Movie Catalog
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">Browse and manage your film library and intellectual property rights.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <RoleGate action="export" resource="movie">
              <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100" onClick={() => setShowExportDialog(true)}>
                <Download className="h-4 w-4" /><span>Export</span>
              </Button>
            </RoleGate>
            <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100" onClick={() => setShowBulkPostersDialog(true)}>
              <ImageIcon className="h-4 w-4" /><span>Bulk Posters</span>
            </Button>
            <RoleGate action="import" resource="movie">
              <Button variant="outline" size="sm" className="gap-2 h-9 px-4 bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100" onClick={() => setShowImportDialog(true)}>
                <Upload className="h-4 w-4" /><span>Upload CSV</span>
              </Button>
            </RoleGate>
            <RoleGate action="create" resource="movie">
              <Button asChild size="sm" className="gap-2 h-9 px-4 bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30">
                <Link href="/movies/new"><Plus className="h-4 w-4" /><span>New Movie</span></Link>
              </Button>
            </RoleGate>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card border-slate-800/60 overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <div className="col-span-2 sm:col-span-1 xl:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Movie Keywords</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input placeholder="Title, Director, Cast…" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-slate-950/40 border-slate-700/50 text-slate-200 placeholder:text-slate-400 text-sm focus-visible:ring-red-500/40 focus-visible:border-red-500/60" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Source</label>
              <Select value={sourceFilter} onValueChange={handleSourceChange}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><Film className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue placeholder="All Sources" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="home_production">Home Production</SelectItem>
                  <SelectItem value="acquired">Acquired</SelectItem>
                  <SelectItem value="jointly_owned">Joint Production</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Language</label>
              <Select value={languageFilter} onValueChange={(v) => { setLanguageFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><Languages className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue placeholder="Language" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Certification</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-between bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm font-normal hover:bg-slate-800/60">
                    <div className="flex items-center gap-2 truncate">
                      <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {certificationFilter.length === 0
                          ? "All Certs"
                          : (certificationFilter.length > 0 && !certificationFilter.includes("A") && certificationOptions.filter(c => c !== "A").every(c => certificationFilter.includes(c)))
                            ? "Except A"
                            : certificationFilter.length === 1
                              ? certificationFilter[0]
                              : `${certificationFilter.length} selected`}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-0 bg-slate-900 border-slate-700/60" align="start">
                  <div className="p-2 border-b border-slate-800/60 space-y-0.5">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer text-sm text-slate-300">
                      <Checkbox
                        checked={certificationFilter.length === 0}
                        onCheckedChange={() => { setCertificationFilter([]); setPage(0); }}
                      />
                      <span className="font-medium">All</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer text-sm text-slate-300">
                      <Checkbox
                        checked={certificationFilter.length > 0 && !certificationFilter.includes("A") && certificationOptions.filter(c => c !== "A").every(c => certificationFilter.includes(c))}
                        onCheckedChange={() => {
                          const exceptA = certificationOptions.filter(c => c !== "A");
                          setCertificationFilter(exceptA);
                          setPage(0);
                        }}
                      />
                      <span className="font-medium">Except A</span>
                    </label>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
                    {certificationOptions.map((cert) => (
                      <label key={cert} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 cursor-pointer text-sm text-slate-300">
                        <Checkbox checked={certificationFilter.includes(cert)}
                          onCheckedChange={(checked) => {
                            setCertificationFilter(prev => checked ? [...prev, cert] : prev.filter(c => c !== cert));
                            setPage(0);
                          }} />
                        <span className="font-medium">{cert}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Versions</label>
              <Select value={versionFilter} onValueChange={(v) => { setVersionFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><Languages className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue placeholder="All Versions" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Movies</SelectItem>
                  <SelectItem value="multi">Multi-Version</SelectItem>
                  <SelectItem value="single">Single Version</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Nature</label>
              <Select value={natureFilter} onValueChange={(v) => { setNatureFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue placeholder="Any Nature" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Nature</SelectItem>
                  {natureTypes.map((n) => <SelectItem key={n.id} value={n.name}>{n.name}</SelectItem>)}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v === "all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><LayoutGrid className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue placeholder="All Territories" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  <SelectItem value="World Wide">World Wide</SelectItem>
                  <SelectItem value="India">India</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Release From</label>
              <Input
                type="date"
                value={yearFrom}
                onChange={(e) => { setYearFrom(e.target.value); setPage(0); }}
                className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm focus-visible:ring-red-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Release To</label>
              <Input
                type="date"
                value={yearTo}
                onChange={(e) => { setYearTo(e.target.value); setPage(0); }}
                className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm focus-visible:ring-red-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Sort By</label>
              <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-full bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <div className="flex items-center gap-2"><Settings2 className="h-3.5 w-3.5 text-slate-400 shrink-0" /><SelectValue /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title_asc">A–Z (Title)</SelectItem>
                  <SelectItem value="title_desc">Z–A (Title)</SelectItem>
                  <SelectItem value="release_date_desc">Newest Release</SelectItem>
                  <SelectItem value="release_date_asc">Oldest Release</SelectItem>
                  <SelectItem value="created_at_desc">Newly Created</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canFilterByApproval && (
            <div className="pt-3 border-t border-slate-800/40 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {canSeeAllStatuses ? "Approval Status:" : "Show:"}
              </div>
              <Select value={approvalFilter} onValueChange={(v) => { setApprovalFilter(v as ApprovalStatus | "all"); setPage(0); }}>
                <SelectTrigger className="h-9 w-44 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Movies</SelectItem>
                  <SelectItem value="approved">Approved only</SelectItem>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {!canSeeAllStatuses && approvalFilter !== "approved" && (
                <p className="text-[10px] text-slate-500">
                  Approved movies are visible to all users in the catalog.
                </p>
              )}
            </div>
          )}

          {showAgreementExpiry && (
            <div className="pt-3 border-t border-slate-800/40 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                Agreement Expiry Year:
              </div>
              <Select value={agreementExpiryYear} onValueChange={(v) => { setAgreementExpiryYear(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-40 bg-slate-950/40 border-slate-700/50 text-slate-300 text-sm">
                  <SelectValue placeholder="Any Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Year</SelectItem>
                  {expiryYearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              {agreementExpiryYear !== "all" && (
                <p className="text-xs text-slate-400">
                  Agreements expiring in <span className="font-semibold text-slate-300">{agreementExpiryYear}</span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card border-slate-800/60 overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
              <Film className="h-4 w-4 text-red-400" />
              Film Library
              <Badge className="ml-0.5 bg-slate-800/80 text-slate-300 border-slate-700/50 font-medium text-xs">
                {loading ? "…" : totalCount}
              </Badge>
            </CardTitle>
            {totalCount > pageSize && (
              <p className="text-xs text-slate-400">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-red-400/60" />
              <p className="text-slate-400 text-sm">Loading catalog…</p>
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="p-4 rounded-full bg-slate-800/50 border border-slate-700/40">
                <Film className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-slate-400 font-medium">No movies found</p>
              <p className="text-slate-400 text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">Title</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Source</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden sm:table-cell">Release</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell">Cert</TableHead>
                    {showMultiVersionCol && <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Languages</TableHead>}
                    {showJointProdCols && (
                      <>
                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Rev Share</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Prod House</TableHead>
                      </>
                    )}
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Rights</TableHead>
                    {showAgreementEndCol && <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden xl:table-cell">Agreement End</TableHead>}
                    {showBuyBackCol && <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden xl:table-cell">Buy Back</TableHead>}
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden xl:table-cell">WTP</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movies.map((movie) => {
                    const pv = movie.primary_version || movie.versions[0];
                    const movieId = pv?.id;
                    const isSold = movie.nature_of_rights?.toLowerCase().includes("sold");
                    const isAcquired = movie.source === "acquired" && !isSold;
                    const isExpiredAgreement = pv?.agreement_end_date && new Date(pv.agreement_end_date) < new Date();
                    const isExpired = isExpiredAgreement || isSold;

                    return (
                      <TableRow key={movie.production_no} className="border-slate-800/40 hover:bg-slate-800/30 transition-colors group">
                        <TableCell className="pl-6 max-w-xs py-3.5">
                          <Link
                            href={`/movies/${movieId}`}
                            className="font-semibold text-sm text-slate-200 hover:text-red-400 transition-colors line-clamp-1 block"
                          >
                            {movie.title}
                          </Link>
                          {movie.production_no && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{movie.production_no}</span>
                          )}
                        </TableCell>

                        <TableCell className="py-3.5">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] w-fit font-semibold px-2 py-0.5",
                                movie.source === "acquired"
                                  ? "bg-violet-500/10 text-violet-400 border-violet-500/25"
                                  : (movie.nature_of_rights === "Jointly Owned")
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/25"
                              )}
                            >
                              {movie.source === "acquired" ? "Acquired" :
                                (movie.nature_of_rights === "Jointly Owned") ? "Jointly Owned" : "Home"}
                            </Badge>
                            {isExpired && (
                              <Badge variant="outline" className="text-[10px] w-fit font-semibold px-2 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">
                                Expired
                              </Badge>
                            )}
                            {canFilterByApproval && (movie as any).approval_status === "pending" && (
                              <Badge variant="outline" className="text-[10px] w-fit font-semibold px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border-yellow-500/25">
                                Pending
                              </Badge>
                            )}
                            {canFilterByApproval && (movie as any).approval_status === "rejected" && (
                              <Badge variant="outline" className="text-[10px] w-fit font-semibold px-2 py-0.5 bg-red-500/10 text-red-400 border-red-500/25">
                                Rejected
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell text-xs tabular-nums text-slate-400 py-3.5">
                          {pv?.release_date ? new Date(pv.release_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (movie.release_year || "—")}
                        </TableCell>

                        <TableCell className="hidden md:table-cell py-3.5">
                          {movie.certification ? (
                            <Badge variant="outline" className="text-[10px] font-bold bg-slate-800/60 text-slate-400 border-slate-700/50">{movie.certification}</Badge>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </TableCell>

                        {showMultiVersionCol && (
                          <TableCell className="hidden lg:table-cell py-3.5">
                            {movie.total_versions > 1 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400">{movie.total_versions}</span>
                                <div className="flex -space-x-1">
                                  {movie.versions.slice(0, 3).map((v) => (
                                    <div key={v.id} className="h-5 w-5 rounded-full bg-red-500/10 border border-slate-800 flex items-center justify-center text-[8px] font-bold text-red-400" title={v.language}>
                                      {v.language?.substring(0, 2).toUpperCase()}
                                    </div>
                                  ))}
                                  {movie.total_versions > 3 && (
                                    <div className="h-5 w-5 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400">
                                      +{movie.total_versions - 3}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        )}

                        {showJointProdCols && (
                          <>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-400 py-3.5">
                              {pv?.revenue_share || "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-400 py-3.5">
                              {movie.production_house_name || "—"}
                            </TableCell>
                          </>
                        )}

                        <TableCell className="hidden lg:table-cell py-3.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Activity className="h-3 w-3 text-slate-400" />
                            <span className="text-emerald-400 font-semibold">{movie.total_rights - movie.expired_rights}</span>
                            {movie.expired_rights > 0 && (
                              <span className="text-rose-500/70">/ {movie.expired_rights} exp</span>
                            )}
                          </div>
                        </TableCell>

                        {showAgreementEndCol && (
                          <TableCell className="hidden xl:table-cell py-3.5">
                            {isAcquired
                              ? getAgreementEndBadge(pv?.agreement_end_date)
                              : <span className="text-slate-400 text-xs">—</span>}
                          </TableCell>
                        )}

                        {showBuyBackCol && (
                          <TableCell className="hidden xl:table-cell text-xs tabular-nums text-slate-400 py-3.5">
                            {formatDate(pv?.joint_prod_buy_back_date)}
                          </TableCell>
                        )}

                        <TableCell className="hidden xl:table-cell py-3.5">
                          {pv?.wtp_library ? (
                            <Badge variant="outline" className="text-[10px] font-semibold bg-red-500/10 text-red-400 border-red-500/25">
                              {pv.wtp_library}
                            </Badge>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </TableCell>

                        <TableCell className="text-right pr-6 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <RoleGate action="edit" resource="movie">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" asChild>
                                <Link href={`/movies/${movieId}/edit`}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </RoleGate>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10" asChild>
                              <Link href={`/movies/${movieId}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/60">
              <p className="text-xs text-slate-400">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60"
                  onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {[...Array(Math.min(totalPages, 5))].map((_, i) => (
                  <Button key={i}
                    variant="outline"
                    size="sm"
                    className={cn("h-7 w-7 p-0 text-xs border",
                      page === i
                        ? "bg-red-600 border-red-600 text-white hover:bg-red-500"
                        : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60"
                    )}
                    onClick={() => setPage(i)}>
                    {i + 1}
                  </Button>
                ))}
                {totalPages > 5 && page >= 5 && (
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs bg-red-600 border-red-600 text-white">{page + 1}</Button>
                )}
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkPostersUploadDialog open={showBulkPostersDialog} onOpenChange={setShowBulkPostersDialog} onSuccess={() => fetchMovies()} />
      <ComprehensiveCSVImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} onSuccess={() => fetchMovies()} />
      <DataExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        data={allFilteredMovies as unknown as Record<string, unknown>[]}
        filename={`movies_${exportMovieFormat}`}
        fields={exportMovieFormat === "home" ? HOME_EXPORT_FIELDS : exportMovieFormat === "acquired" ? ACQUIRED_EXPORT_FIELDS : ALL_EXPORT_FIELDS}
        headerContent={
          <div className="space-y-1">
            <label className="text-sm font-medium">Movie format</label>
            <Select value={exportMovieFormat} onValueChange={(v) => setExportMovieFormat(v as "home" | "acquired" | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Movies</SelectItem>
                <SelectItem value="home">Home Production only</SelectItem>
                <SelectItem value="acquired">Acquired only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Each dubbed / multi-language version is exported as a separate row.</p>
          </div>
        }
        onPrepareData={async (_selectedKeys, rawData) => {
          // Flatten GroupedMovie[] → one row per version
          const rows: Record<string, unknown>[] = [];
          for (const group of rawData as unknown as GroupedMovie[]) {
            const versions: MovieLanguageVersion[] = group.versions?.length
              ? group.versions
              : group.primary_version
                ? [group.primary_version]
                : [];
            for (const v of versions) {
              if (exportMovieFormat === "home" && v.source !== "home_production") continue;
              if (exportMovieFormat === "acquired" && v.source !== "acquired") continue;
              rows.push(v as unknown as Record<string, unknown>);
            }
          }
          return { data: rows };
        }}
      />
    </div>
  );
}

// ── Export field definitions ──────────────────────────────────────────────────

const HOME_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "production_no", label: "Production No" },
  { key: "title", label: "Title" },
  { key: "cast_names", label: "Cast" },
  { key: "director_names", label: "Director" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Theatrical Release Date" },
  { key: "release_year", label: "Release Year" },
  { key: "trailer_link", label: "YT Trailer Link" },
  { key: "certification", label: "Censor" },
  { key: "nature_of_rights", label: "Nature of Right" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
  { key: "jointly_exploitation_rights", label: "Joint Exploitation Rights" },
  { key: "revenue_share", label: "Revenue Share" },
  { key: "joint_prod_buy_back_date", label: "Joint Buy Back Date" },
  { key: "wtp_library", label: "WTP / Library" },
];

const ACQUIRED_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "title", label: "Movie Name" },
  { key: "cast_names", label: "Cast Details" },
  { key: "director_names", label: "Director" },
  { key: "production_no", label: "Production No" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Release Date" },
  { key: "release_year", label: "Release Year" },
  { key: "certification", label: "Certification" },
  { key: "territory", label: "Territory" },
  { key: "assignor_licensor", label: "Assignor / Licensor" },
  { key: "licensee", label: "Licensee" },
  { key: "agreement_date", label: "Agreement Date" },
  { key: "agreement_start_date", label: "Agreement Start Date" },
  { key: "agreement_end_date", label: "Agreement End Date" },
  { key: "satellite_rights", label: "Satellite Rights" },
  { key: "satellite_rights_start_date", label: "Satellite Rights Start Date" },
  { key: "satellite_rights_end_date", label: "Satellite Rights End Date" },
  { key: "satellite_rights_classification", label: "Satellite Rights Classification" },
  { key: "nature_of_satellite_rights", label: "Nature of Satellite Rights" },
  { key: "internet_rights", label: "Internet Rights" },
  { key: "internet_rights_start_date", label: "Internet Rights Start Date" },
  { key: "internet_rights_end_date", label: "Internet Rights End Date" },
  { key: "internet_rights_classification", label: "Internet Rights Classification" },
  { key: "nature_of_internet_rights", label: "Nature of Internet Rights" },
  { key: "syndication_internet_rights", label: "Syndication Internet Rights" },
  { key: "negative_rights", label: "Negative Rights" },
  { key: "negative_rights_start_date", label: "Negative Rights Start Date" },
  { key: "negative_rights_end_date", label: "Negative Rights End Date" },
  { key: "nature_of_negative_rights", label: "Nature of Negative Rights" },
  { key: "other_rights", label: "Other Rights" },
  { key: "other_rights_start_date", label: "Other Rights Start Date" },
  { key: "other_rights_end_date", label: "Other Rights End Date" },
  { key: "nature_of_other_rights", label: "Nature of Other Rights" },
  { key: "clip_rights", label: "Clip Rights" },
  { key: "clip_rights_duration", label: "Clip Rights Duration" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "prequel_sequel_rights", label: "Prequel / Sequel Rights" },
  { key: "character_rights", label: "Character Rights" },
  { key: "subtitling_rights", label: "Subtitling Rights" },
  { key: "dubbing_rights", label: "Dubbing Rights" },
  { key: "nature_of_rights", label: "Nature of Rights" },
  { key: "wtp_library", label: "WTP / Library" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" }];

// Combined for "all movies" export
const ALL_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "production_no", label: "Production No" },
  { key: "title", label: "Title" },
  { key: "source", label: "Source", getter: (r) => r.source === "home_production" ? "Home Production" : "Acquired" },
  { key: "cast_names", label: "Cast" },
  { key: "director_names", label: "Director" },
  { key: "language", label: "Language" },
  { key: "production_house_name", label: "Production House" },
  { key: "release_date", label: "Release Date" },
  { key: "release_year", label: "Release Year" },
  { key: "certification", label: "Censor" },
  { key: "territory", label: "Territory" },
  { key: "nature_of_rights", label: "Nature of Rights" },
  { key: "holdbacks", label: "Holdbacks" },
  { key: "assignor_licensor", label: "Assignor / Licensor" },
  { key: "agreement_end_date", label: "Agreement End Date" },
  { key: "jointly_exploitation_rights", label: "Joint Exploitation Rights" },
  { key: "revenue_share", label: "Revenue Share" },
  { key: "wtp_library", label: "WTP / Library" },
  { key: "remarks", label: "Remarks" },
  { key: "actionables", label: "Actionable" },
];
