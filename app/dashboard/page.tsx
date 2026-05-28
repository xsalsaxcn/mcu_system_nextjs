"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Users,
  Clock,
  CheckCircle,
  Award,
  XCircle,
  HelpCircle,
  TrendingUp,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Trophy,
  AlertTriangle,
} from "lucide-react";

const FILTERS = ["Semua", "Belum Selesai", "Selesai", "Lulus", "Tidak Lulus", "Belum Dinilai"];

export default function DashboardPage() {
  return (
    <AuthGate>
      {(user) => <Dashboard user={user} />}
    </AuthGate>
  );
}

function StatCard({
  label,
  value,
  hint,
  active,
  onClick,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: any;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ElementType;
  variant?: "default" | "success" | "danger" | "warning" | "info";
}) {
  const variantStyles = {
    default: "bg-muted/50 text-muted-foreground",
    success: "bg-emerald-50 text-emerald-600",
    danger: "bg-red-50 text-red-600",
    warning: "bg-amber-50 text-amber-600",
    info: "bg-blue-50 text-blue-600",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start rounded-lg border p-4 text-left transition-all duration-200",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            "text-xs font-medium uppercase tracking-wider",
            active ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              active ? "bg-primary-foreground/20" : variantStyles[variant]
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className={cn("mt-2 text-3xl font-bold", active ? "text-primary-foreground" : "text-foreground")}>
        {value}
      </div>
      {hint && (
        <span className={cn("mt-1 text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {hint}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ value }: { value: string }) {
  const variants: Record<string, "success" | "destructive" | "info" | "secondary"> = {
    Lulus: "success",
    "Tidak Lulus": "destructive",
    Selesai: "info",
  };

  return (
    <Badge variant={variants[value] || "secondary"} className="font-medium">
      {value}
    </Badge>
  );
}

function CompactTable({ title, rows, emptyText, icon: Icon }: { title: string; rows: any[]; emptyText: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", title === "LULUS" ? "text-emerald-600" : "text-red-600")} />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <div className="rounded-lg bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>No. MCU</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow key={row.participant_id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.mcu_id || row.external_id || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.package_name || "-"}</TableCell>
                    <TableCell className="text-right font-bold">{row.total_score ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [status, setStatus] = useState("Semua");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const program = user.program_type === "all" ? "capaska" : user.program_type;

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  async function loadDashboard(nextStatus = status) {
    setLoading(true);
    setSelected(null);

    const res = await fetch(
      `/api/dashboard?program=${program}&source_id=${sourceId}&status=${encodeURIComponent(nextStatus)}&limit=500`,
      { cache: "no-store" }
    );

    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  function chooseStatus(nextStatus: string) {
    setStatus(nextStatus);
    loadDashboard(nextStatus);
  }

  function exportExcel(type: "progress" | "full") {
    const params = new URLSearchParams({
      program,
      source_id: sourceId,
      status,
      type,
    });

    window.open(`/api/dashboard/export?${params.toString()}`, "_blank");
  }

  const rows = data?.rows || [];

  const rowsToShow = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    let filtered = rows.filter((row: any) => {
      if (!keyword) return true;

      const haystack = [row.name, row.mcu_id, row.external_id, row.nik, row.employee_nik]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });

    const scoreValue = (row: any) => {
      const n = Number(row.total_score);
      return Number.isFinite(n) ? n : -999999;
    };

    const progressValue = (row: any) => {
      const n = Number(row.progress_percent);
      return Number.isFinite(n) ? n : 0;
    };

    filtered = [...filtered].sort((a: any, b: any) => {
      if (sortBy === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "progress_desc") return progressValue(b) - progressValue(a);
      if (sortBy === "progress_asc") return progressValue(a) - progressValue(b);
      if (sortBy === "score_desc") return scoreValue(b) - scoreValue(a);
      if (sortBy === "score_asc") return scoreValue(a) - scoreValue(b);

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return filtered;
  }, [rows, searchTerm, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [status, searchTerm, sortBy, rowsPerPage, sourceId]);

  const pageCount = useMemo(() => {
    if (rowsPerPage === 0) return 1;
    return Math.max(1, Math.ceil(rowsToShow.length / rowsPerPage));
  }, [rowsToShow.length, rowsPerPage]);

  const effectivePage = Math.min(currentPage, pageCount);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === 0) return rowsToShow;

    const start = (effectivePage - 1) * rowsPerPage;
    return rowsToShow.slice(start, start + rowsPerPage);
  }, [rowsToShow, rowsPerPage, effectivePage]);

  const firstRowNumber = rowsToShow.length ? (rowsPerPage === 0 ? 1 : (effectivePage - 1) * rowsPerPage + 1) : 0;
  const lastRowNumber = rowsPerPage === 0 ? rowsToShow.length : Math.min(effectivePage * rowsPerPage, rowsToShow.length);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold">Dashboard Progress & Kelulusan</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Supervisor melihat progress stage, data selesai/belum selesai, kelulusan berdasarkan parameter kelulusan, dan export hasil pemeriksaan.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4">
            <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
              Dashboard v38 - stage detail + registrasi ulang fix
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              className="h-10 rounded-lg border-0 bg-primary-foreground/10 px-3 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary-foreground/30"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="all" className="text-foreground">
                Semua Database Instansi
              </option>
              {sources.map((s) => (
                <option key={s.id} value={s.id} className="text-foreground">
                  {s.name} - {s.institution_name || "-"}
                </option>
              ))}
            </select>

            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => loadDashboard()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Memuat..." : "Refresh Dashboard"}
            </Button>

            <Button
              variant="outline"
              className="gap-2 border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => exportExcel("progress")}
              disabled={!data?.ok}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Progress
            </Button>

            <Button
              variant="outline"
              className="gap-2 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              onClick={() => exportExcel("full")}
              disabled={!data?.ok}
            >
              <Download className="h-4 w-4" />
              Export Semua Hasil
            </Button>
          </div>
        </CardContent>
      </Card>

      {data?.ok && (
        <>
          {/* Stats Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <StatCard
              label="Total"
              value={data.summary.total}
              icon={Users}
              variant="default"
              active={status === "Semua"}
              onClick={() => chooseStatus("Semua")}
            />
            <StatCard
              label="Belum Selesai"
              value={data.summary.belum_selesai}
              icon={Clock}
              variant="warning"
              active={status === "Belum Selesai"}
              onClick={() => chooseStatus("Belum Selesai")}
            />
            <StatCard
              label="Selesai"
              value={data.summary.selesai}
              icon={CheckCircle}
              variant="info"
              active={status === "Selesai"}
              onClick={() => chooseStatus("Selesai")}
            />
            <StatCard
              label="Lulus"
              value={data.summary.lulus}
              hint="hanya yang selesai"
              icon={Award}
              variant="success"
              active={status === "Lulus"}
              onClick={() => chooseStatus("Lulus")}
            />
            <StatCard
              label="Tidak Lulus"
              value={data.summary.tidak_lulus}
              hint="hanya yang selesai"
              icon={XCircle}
              variant="danger"
              active={status === "Tidak Lulus"}
              onClick={() => chooseStatus("Tidak Lulus")}
            />
            <StatCard
              label="Belum Dinilai"
              value={data.summary.belum_dinilai}
              icon={HelpCircle}
              variant="default"
              active={status === "Belum Dinilai"}
              onClick={() => chooseStatus("Belum Dinilai")}
            />
            <StatCard
              label="Rata-rata"
              value={`${data.summary.rata_rata}%`}
              icon={TrendingUp}
              variant="info"
            />
          </div>

          {/* Main Table Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Daftar Peserta: {status}</CardTitle>
                  <CardDescription>
                    Kelulusan hanya dihitung untuk peserta yang sudah menyelesaikan seluruh stage parameter. Klik baris peserta untuk melihat detail stage.
                  </CardDescription>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap gap-2 pt-2">
                {FILTERS.map((filter) => (
                  <Button
                    key={filter}
                    variant={status === filter ? "default" : "outline"}
                    size="sm"
                    onClick={() => chooseStatus(filter)}
                    className="h-8"
                  >
                    {filter}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Search and Filters */}
              <div className="grid gap-3 lg:grid-cols-[1fr_200px_160px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari nama, No MCU, NIK..."
                  />
                </div>

                <select
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="name_asc">Alphabet A-Z</option>
                  <option value="name_desc">Alphabet Z-A</option>
                  <option value="progress_desc">Progress tertinggi</option>
                  <option value="progress_asc">Progress terendah</option>
                  <option value="score_desc">Score tertinggi</option>
                  <option value="score_asc">Score terendah</option>
                </select>

                <select
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={150}>150 rows</option>
                  <option value={0}>Semua rows</option>
                </select>

                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4">
                  <span className="text-xs font-medium text-muted-foreground">Data Cocok</span>
                  <span className="text-lg font-bold text-foreground">{rowsToShow.length}</span>
                </div>
              </div>

              {/* Data Table */}
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nama</TableHead>
                      <TableHead>No. MCU</TableHead>
                      <TableHead>Database</TableHead>
                      <TableHead>Paket</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kelulusan</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.map((row: any) => {
                      const isOpen = Number(selected?.participant_id) === Number(row.participant_id);

                      return (
                        <Fragment key={row.participant_id}>
                          <TableRow
                            className={cn("cursor-pointer", isOpen && "bg-primary/5")}
                            onClick={() => setSelected(isOpen ? null : row)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors",
                                    isOpen
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </div>
                                <span className="truncate">{row.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{row.mcu_id || row.external_id || "-"}</TableCell>
                            <TableCell className="text-muted-foreground">{row.source_name}</TableCell>
                            <TableCell className="text-muted-foreground">{row.package_name}</TableCell>
                            <TableCell>
                              <StatusBadge value={row.status_pemeriksaan} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={row.kelulusan_status} />
                            </TableCell>
                            <TableCell className="text-right font-bold">{row.total_score ?? "-"}</TableCell>
                            <TableCell>
                              <div className="min-w-[120px]">
                                <div className="mb-1 flex items-center justify-between text-xs">
                                  <span className="font-medium text-muted-foreground">
                                    {row.done_stage}/{row.total_stage}
                                  </span>
                                  <span className="font-bold">{row.progress_percent}%</span>
                                </div>
                                <Progress value={row.progress_percent} className="h-2" />
                              </div>
                            </TableCell>
                          </TableRow>

                          {isOpen && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-4">
                                <Card className="border-primary/20">
                                  <CardHeader className="pb-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <CardTitle className="text-lg">Detail Stage: {row.name}</CardTitle>
                                        <CardDescription>
                                          No. MCU {row.mcu_id || row.external_id || "-"} · Score{" "}
                                          {row.total_score ?? "-"} · Kelulusan {row.kelulusan_status} · Range{" "}
                                          {row.pass_min_score} - {row.pass_max_score}
                                        </CardDescription>
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelected(null);
                                        }}
                                      >
                                        <X className="mr-1 h-4 w-4" />
                                        Tutup
                                      </Button>
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <StageProgress stages={row.stages || []} />
                                  </CardContent>
                                </Card>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                    {!rowsToShow.length && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                          Belum ada data untuk filter ini.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Menampilkan <span className="font-semibold text-foreground">{firstRowNumber}</span> -{" "}
                  <span className="font-semibold text-foreground">{lastRowNumber}</span> dari{" "}
                  <span className="font-semibold text-foreground">{rowsToShow.length}</span> data
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={effectivePage <= 1}
                    onClick={() => setCurrentPage(1)}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={effectivePage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex h-8 items-center gap-1 rounded-md bg-background px-3 text-sm font-medium">
                    <span>{effectivePage}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{pageCount}</span>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={effectivePage >= pageCount}
                    onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={effectivePage >= pageCount}
                    onClick={() => setCurrentPage(pageCount)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lulus/Tidak Lulus Tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CompactTable
              title="LULUS"
              rows={data.lulus_rows || []}
              emptyText="Belum ada peserta selesai yang masuk kriteria lulus."
              icon={Trophy}
            />
            <CompactTable
              title="TIDAK LULUS"
              rows={data.tidak_lulus_rows || []}
              emptyText="Belum ada peserta selesai yang di luar range kelulusan."
              icon={AlertTriangle}
            />
          </div>
        </>
      )}
    </div>
  );
}
