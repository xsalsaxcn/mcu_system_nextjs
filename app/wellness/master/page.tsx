"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AuthGate from "@/components/AuthGate";

export default function WellnessMasterPage() {
  return <AuthGate>{() => <WellnessMaster />}</AuthGate>;
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstColumn(row: any, aliases: string[]) {
  const normalized = Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return "";
}

function parseNumber(value: any) {
  const raw = clean(value).replace(/\s+/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function portionMultiplier(value: any) {
  const text = clean(value).toLowerCase().replace(/\s+/g, "");
  if (!text || text === "1" || text === "1porsi" || text === "1portion") return 1;
  if (text === "1/2" || text === "0.5" || text === "0,5") return 0.5;
  if (text === "1/3") return 1 / 3;
  if (text === "1/4" || text === "0.25" || text === "0,25") return 0.25;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function parseImportedFood(row: any, rowNumber: number) {
  const foodName = clean(
    firstColumn(row, ["Nama Makanan", "Makanan", "Food Name", "food_name", "Nama"]),
  );
  const calories = parseNumber(
    firstColumn(row, ["Kalori", "Kkal", "Calories", "Calorie"]),
  );
  const portion =
    clean(firstColumn(row, ["Porsi", "Porsi Acuan", "Portion", "Serving"])) || "1";
  const multiplier = portionMultiplier(portion);
  const normalizedCalories =
    calories > 0 ? Math.round((calories / multiplier) * 100) / 100 : 0;

  return {
    row_number: rowNumber,
    food_name: foodName,
    calories,
    portion,
    normalized_calories: normalizedCalories,
    category: clean(firstColumn(row, ["Kategori", "Category"])),
    aliases: clean(firstColumn(row, ["Alias", "Aliases", "Sinonim"])),
    valid: Boolean(foodName && calories > 0),
  };
}

// WELLNESS_BULK_WORKOUT_IMPORT_V126M97_4
function parseImportedActivity(row: any, rowNumber: number) {
  const activityName = clean(
    firstColumn(row, [
      "Nama Aktivitas",
      "Aktivitas",
      "Workout",
      "Activity",
      "Activity Name",
      "activity_name",
      "Nama",
    ]),
  );
  const met = parseNumber(firstColumn(row, ["MET", "Met", "met"]));
  const caloriesPerKm = parseNumber(
    firstColumn(row, [
      "Kalori per km",
      "Kalori/km",
      "Calories per km",
      "Calories/km",
      "calories_per_km",
    ]),
  );
  const unit =
    clean(firstColumn(row, ["Unit", "Satuan", "unit"])) || "menit";
  const category = clean(
    firstColumn(row, ["Kategori", "Category", "category"]),
  );

  return {
    row_number: rowNumber,
    activity_name: activityName,
    met,
    calories_per_km: caloriesPerKm,
    unit,
    category,
    valid: Boolean(activityName && (met > 0 || caloriesPerKm > 0)),
  };
}

function WellnessMaster() {
  // WELLNESS_MASTER_SERVER_PAGINATION_V126J
  const [foods, setFoods] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  // WELLNESS_MASTER_WORKOUT_ADMIN_EXPORT_RANGE_V126M97_3
  const [activitySearch, setActivitySearch] = useState("");
  const [foodSearch, setFoodSearch] = useState("");
  const [foodPage, setFoodPage] = useState(1);
  const [foodTotal, setFoodTotal] = useState(0);
  const [foodTotalPages, setFoodTotalPages] = useState(1);
  const [foodFrom, setFoodFrom] = useState(0);
  const [foodTo, setFoodTo] = useState(0);
  const [foodLoading, setFoodLoading] = useState(false);
  // WELLNESS_MASTER_FOOD_DELETE_V126M106
  const [foodDeletingId, setFoodDeletingId] = useState<number | null>(null);
  // WELLNESS_MASTER_FOOD_BULK_DELETE_V126M107
  const [foodSelectedIds, setFoodSelectedIds] = useState<number[]>([]);
  const [foodBulkDeleting, setFoodBulkDeleting] = useState(false);
  const [message, setMessage] = useState(
    "Master Wellness memakai database internal, bukan Google Sheet.",
  );
  const [foodForm, setFoodForm] = useState<any>({});
  const [activityForm, setActivityForm] = useState<any>({ unit: "menit" });
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // WELLNESS_BULK_WORKOUT_IMPORT_V126M97_4
  const [activityImportOpen, setActivityImportOpen] = useState(false);
  const [activityImportRows, setActivityImportRows] = useState<any[]>([]);
  const [activityImportFileName, setActivityImportFileName] = useState("");
  const [activityImporting, setActivityImporting] = useState(false);
  const activityImportInputRef = useRef<HTMLInputElement | null>(null);

  async function loadFoods(page = foodPage, search = foodSearch) {
    setFoodLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "100",
      });

      if (clean(search)) params.set("q", clean(search));

      const response = await fetch(
        `/api/wellness/reference/foods?${params.toString()}`,
        { cache: "no-store" },
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(
          json.message || "Master makanan gagal dimuat.",
        );
      }

      const pagination = json.pagination || {};

      setFoods(json.foods || []);
      setFoodTotal(Number(pagination.total || 0));
      setFoodTotalPages(Number(pagination.total_pages || 1));
      setFoodFrom(Number(pagination.from || 0));
      setFoodTo(Number(pagination.to || 0));
    } catch (error: any) {
      setFoods([]);
      setMessage(
        error?.message || "Master makanan gagal dimuat.",
      );
    } finally {
      setFoodLoading(false);
    }
  }

  async function loadActivities(search = activitySearch) {
    const params = new URLSearchParams();
    if (clean(search)) params.set("q", clean(search));

    const query = params.toString();
    const json = await fetch(
      `/api/wellness/reference/activities${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => ({}));

    setActivities(json.activities || []);
  }

  async function load() {
    await Promise.all([
      loadFoods(1, foodSearch),
      loadActivities(),
    ]);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadActivities(activitySearch);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [activitySearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFoods(foodPage, foodSearch);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [foodPage, foodSearch]);

  async function setupDefaults() {
    setMessage("Mengisi master KaloriData dan KaloriOlahraga...");
    const json = await fetch("/api/wellness/setup", { method: "POST" }).then((r) =>
      r.json(),
    );
    if (!json.ok) {
      setMessage(json.message || "Setup gagal.");
      return;
    }
    setMessage(`Setup berhasil: ${json.foods} makanan, ${json.activities} aktivitas.`);
    setFoodPage(1);
    void loadFoods(1, foodSearch);
    void loadActivities(activitySearch);
  }

  async function saveFood(event: React.FormEvent) {
    event.preventDefault();
    const json = await fetch("/api/wellness/reference/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(foodForm),
    }).then((r) => r.json());
    setMessage(
      json.ok ? "Makanan berhasil disimpan." : json.message || "Gagal simpan makanan.",
    );
    if (json.ok) {
      setFoodForm({});
      setFoodPage(1);
      void loadFoods(1, foodSearch);
    }
  }

  // WELLNESS_MASTER_FOOD_DELETE_V126M106
  // Soft delete only deactivates the master row. Existing participant nutrition
  // history is not changed, and GET/suggest already reads only is_active = 1.
  async function deleteFood(food: any) {
    const id = Number(food?.id || 0);
    const name = clean(food?.food_name) || "makanan ini";

    if (!Number.isFinite(id) || id <= 0) {
      setMessage("ID makanan tidak valid.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${name}" dari Master KaloriData? Data historis peserta tidak akan dihapus.`,
    );
    if (!confirmed) return;

    setFoodDeletingId(id);
    setMessage(`Menghapus ${name}...`);

    try {
      const response = await fetch("/api/wellness/reference/foods", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Gagal menghapus makanan.");
      }

      setMessage(`"${name}" berhasil dihapus dari Master KaloriData.`);
      setFoodSelectedIds((previous) => previous.filter((item) => item !== id));

      const nextPage = foods.length === 1 && foodPage > 1 ? foodPage - 1 : foodPage;
      if (nextPage !== foodPage) {
        setFoodPage(nextPage);
      } else {
        void loadFoods(nextPage, foodSearch);
      }
    } catch (error: any) {
      setMessage(error?.message || "Gagal menghapus makanan.");
    } finally {
      setFoodDeletingId(null);
    }
  }

  // WELLNESS_MASTER_FOOD_BULK_DELETE_V126M107
  function foodIdsOnCurrentPage() {
    return foods
      .map((food: any) => Number(food?.id || 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  }

  function allFoodsOnCurrentPageSelected() {
    const pageIds = foodIdsOnCurrentPage();
    if (!pageIds.length) return false;
    const selected = new Set(foodSelectedIds);
    return pageIds.every((id: number) => selected.has(id));
  }

  function toggleFoodSelection(idValue: any) {
    const id = Number(idValue || 0);
    if (!Number.isFinite(id) || id <= 0) return;

    setFoodSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  }

  function toggleAllFoodsOnCurrentPage() {
    const pageIds = foodIdsOnCurrentPage();
    if (!pageIds.length) return;

    setFoodSelectedIds((previous) => {
      const selected = new Set(previous);
      const allSelected = pageIds.every((id: number) => selected.has(id));

      if (allSelected) {
        for (const id of pageIds) selected.delete(id);
      } else {
        for (const id of pageIds) selected.add(id);
      }

      return Array.from(selected);
    });
  }

  async function deleteSelectedFoods() {
    const ids = [
      ...new Set(
        foodSelectedIds
          .map((value) => Number(value || 0))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];

    if (!ids.length) {
      setMessage("Pilih minimal satu makanan untuk dihapus.");
      return;
    }

    const confirmed = window.confirm(
      `Delete All ${ids.length.toLocaleString("id-ID")} makanan terpilih dari Master KaloriData? ` +
        "Data historis peserta tidak akan dihapus.",
    );
    if (!confirmed) return;

    setFoodBulkDeleting(true);
    setMessage(`Menghapus ${ids.length.toLocaleString("id-ID")} makanan terpilih...`);

    try {
      let deletedCount = 0;

      // Keep each request small. This is faster than deleting row-by-row and
      // avoids a very large Supabase IN filter when selections span pages.
      for (let offset = 0; offset < ids.length; offset += 100) {
        const chunk = ids.slice(offset, offset + 100);
        const response = await fetch("/api/wellness/reference/foods", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: chunk }),
        });
        const json = await response.json().catch(() => ({}));

        if (!response.ok || !json.ok) {
          throw new Error(json.message || "Gagal menghapus makanan terpilih.");
        }

        deletedCount += Number(json.deleted_count || 0);
      }

      const selectedSet = new Set(ids);
      const remainingOnCurrentPage = foods.filter(
        (food: any) => !selectedSet.has(Number(food?.id || 0)),
      ).length;

      setFoodSelectedIds([]);
      setMessage(
        `${deletedCount.toLocaleString("id-ID")} makanan berhasil dihapus dari Master KaloriData.`,
      );

      const nextPage =
        remainingOnCurrentPage === 0 && foodPage > 1
          ? foodPage - 1
          : foodPage;

      if (nextPage !== foodPage) {
        setFoodPage(nextPage);
      } else {
        await loadFoods(nextPage, foodSearch);
      }
    } catch (error: any) {
      setMessage(error?.message || "Gagal menghapus makanan terpilih.");
    } finally {
      setFoodBulkDeleting(false);
    }
  }

  async function saveActivity(event: React.FormEvent) {
    event.preventDefault();
    const json = await fetch("/api/wellness/reference/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activityForm),
    }).then((r) => r.json());
    setMessage(
      json.ok ? "Aktivitas berhasil disimpan." : json.message || "Gagal simpan aktivitas.",
    );
    if (json.ok) {
      setActivityForm({ unit: "menit" });
      void loadActivities(activitySearch);
    }
  }

  async function readImportFile(file: File | null) {
    if (!file) return;
    setMessage("Membaca file Master Data Nutrisi...");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName], {
        defval: "",
      });
      const parsed = rows.map((row, index) => parseImportedFood(row, index + 2));
      setImportFileName(file.name);
      setImportRows(parsed);
      setImportOpen(true);
      const valid = parsed.filter((item) => item.valid).length;
      setMessage(
        `${valid} dari ${parsed.length} baris siap diimpor. Baris tanpa nama atau kalori akan dilewati.`,
      );
    } catch (error: any) {
      setImportRows([]);
      setImportFileName("");
      setMessage(error?.message || "File import tidak dapat dibaca.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function importMasterNutrition() {
    const validRows = importRows.filter((item) => item.valid);
    if (!validRows.length) {
      setMessage("Belum ada baris valid untuk diimpor.");
      return;
    }

    setImporting(true);
    setMessage("Mengimpor Master Data Nutrisi...");
    try {
      const json = await fetch("/api/wellness/reference/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foods: validRows.map((item) => ({
            food_name: item.food_name,
            calories: item.calories,
            portion: item.portion,
            category: item.category,
            aliases: item.aliases,
          })),
        }),
      }).then((response) => response.json());

      if (!json.ok) throw new Error(json.message || "Import gagal.");
      setMessage(
        json.message || `${json.imported_count || validRows.length} makanan berhasil diimpor.`,
      );
      setImportRows([]);
      setImportFileName("");
      setImportOpen(false);
      setFoodPage(1);
      await loadFoods(1, foodSearch);
    } catch (error: any) {
      setMessage(error?.message || "Import Master Data Nutrisi gagal.");
    } finally {
      setImporting(false);
    }
  }

  async function readActivityImportFile(file: File | null) {
    if (!file) return;
    setMessage("Membaca file Master Data Workout...");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName], {
        defval: "",
      });
      const parsed = rows.map((row, index) =>
        parseImportedActivity(row, index + 2),
      );

      setActivityImportFileName(file.name);
      setActivityImportRows(parsed);
      setActivityImportOpen(true);

      const valid = parsed.filter((item) => item.valid).length;
      setMessage(
        `${valid} dari ${parsed.length} baris workout siap diimpor. ` +
          `Nama aktivitas wajib diisi dan minimal MET atau Kalori/km harus > 0.`,
      );
    } catch (error: any) {
      setActivityImportRows([]);
      setActivityImportFileName("");
      setMessage(
        error?.message || "File Master Data Workout tidak dapat dibaca.",
      );
    } finally {
      if (activityImportInputRef.current) {
        activityImportInputRef.current.value = "";
      }
    }
  }

  async function importMasterWorkout() {
    const validRows = activityImportRows.filter((item) => item.valid);

    if (!validRows.length) {
      setMessage("Belum ada baris workout valid untuk diimpor.");
      return;
    }

    setActivityImporting(true);
    setMessage("Mengimpor Master Data Workout...");

    try {
      const json = await fetch("/api/wellness/reference/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activities: validRows.map((item) => ({
            activity_name: item.activity_name,
            met: item.met || null,
            calories_per_km: item.calories_per_km || null,
            unit: item.unit || "menit",
            category: item.category || null,
          })),
        }),
      }).then((response) => response.json());

      if (!json.ok) {
        throw new Error(json.message || "Import Master Workout gagal.");
      }

      const imported = Number(json.imported || validRows.length);
      setMessage(`${imported} Master Workout berhasil diimpor.`);
      setActivityImportRows([]);
      setActivityImportFileName("");
      setActivityImportOpen(false);
      setActivitySearch("");
      await loadActivities("");
    } catch (error: any) {
      setMessage(error?.message || "Import Master Workout gagal.");
    } finally {
      setActivityImporting(false);
    }
  }

  function downloadWorkoutTemplate() {
    const csv = [
      "Nama Aktivitas,MET,Kalori per km,Unit,Kategori",
      '"Push Up / Calisthenics Vigorous",8,,menit,"Strength / Bodyweight"',
      '"Squat Bodyweight Moderate",5,,menit,"Strength / Bodyweight"',
      '"Jalan Cepat",4.3,,menit,Cardio',
      '"Lari",8.3,60,km,Cardio',
    ].join("\r\n");

    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template_master_data_workout.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const csv = [
      "Nama Makanan,Kalori,Porsi,Kategori,Alias",
      'Nasi Goreng,600,1,Makanan Pokok,"nasi goreng kampung"',
      'Ayam Goreng,150,1/2,Lauk / Protein,"ayam goreng paha"',
    ].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template_master_data_nutrisi.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const validImportRows = importRows.filter((item) => item.valid);
  const validActivityImportRows = activityImportRows.filter(
    (item) => item.valid,
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Master Wellness</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">
            Kelola referensi makanan, kalori, dan aktivitas pengganti sheet
            KaloriData/KaloriOlahraga.
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Makanan
          </div>
          <div className="mt-2 text-3xl font-black text-slate-900">{foodTotal.toLocaleString("id-ID")}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Aktivitas
          </div>
          <div className="mt-2 text-3xl font-black text-slate-900">
            {activities.length}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Setup
          </div>
          <button
            type="button"
            onClick={setupDefaults}
            className="mt-3 w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white"
          >
            Seed dari Excel lama
          </button>
        </div>
      </section>

      <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
        {message}
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        <a
          href="/wellness/settings"
          className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white"
        >
          Setting Parameter Wellness
        </a>
        <a
          href="/wellness/import"
          className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white"
        >
          Import Peserta Wellness
        </a>
        <a
          href="/wellness/signup"
          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700"
        >
          Link Signup Peserta
        </a>
        <button
          type="button"
          onClick={() => setImportOpen((current) => !current)}
          className="rounded-2xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white"
        >
          Import Master Data Nutrisi
        </button>
        <button
          type="button"
          onClick={() => setActivityImportOpen((current) => !current)}
          className="rounded-2xl bg-sky-700 px-4 py-3 text-center text-sm font-black text-white"
        >
          Import Master Data Workout
        </button>
      </section>

      {importOpen ? (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xl font-black text-emerald-950">
                Import Master Data Nutrisi
              </div>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-emerald-800">
                Kolom: Nama Makanan, Kalori, Porsi, Kategori, Alias. Kalori pada
                porsi 1/2, 1/3, atau 1/4 otomatis dinormalisasi menjadi kalori
                per 1 porsi tanpa mengubah struktur database.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-emerald-800 shadow-sm"
              >
                Download Template
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => void readImportFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-2xl bg-emerald-700 px-4 py-3 text-xs font-black text-white"
              >
                Pilih Excel/CSV
              </button>
            </div>
          </div>

          {importFileName ? (
            <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
              File: {importFileName} · {validImportRows.length} baris valid ·{" "}
              {importRows.length - validImportRows.length} dilewati
            </div>
          ) : null}

          {importRows.length > 0 ? (
            <>
              <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-emerald-100 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-emerald-50 text-xs uppercase text-emerald-900">
                    <tr>
                      <th className="px-3 py-3 text-left">Baris</th>
                      <th className="px-3 py-3 text-left">Nama Makanan</th>
                      <th className="px-3 py-3 text-left">Kalori File</th>
                      <th className="px-3 py-3 text-left">Porsi</th>
                      <th className="px-3 py-3 text-left">Kalori 1 Porsi</th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importRows.slice(0, 100).map((item) => (
                      <tr key={item.row_number}>
                        <td className="px-3 py-3">{item.row_number}</td>
                        <td className="px-3 py-3 font-bold">{item.food_name || "-"}</td>
                        <td className="px-3 py-3">{item.calories || "-"}</td>
                        <td className="px-3 py-3">{item.portion}</td>
                        <td className="px-3 py-3 font-bold">
                          {item.normalized_calories || "-"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-black ${
                              item.valid
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {item.valid ? "Siap" : "Tidak lengkap"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => void importMasterNutrition()}
                disabled={importing || validImportRows.length === 0}
                className="mt-4 w-full rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {importing
                  ? "Mengimpor..."
                  : `Import ${validImportRows.length} Master Nutrisi`}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {activityImportOpen ? (
        <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xl font-black text-sky-950">
                Import Master Data Workout
              </div>
              <div className="mt-1 text-sm font-semibold text-sky-800">
                Upload CSV/XLSX. Nama aktivitas wajib diisi; minimal MET atau
                Kalori/km harus memiliki nilai.
              </div>
              {activityImportFileName ? (
                <div className="mt-2 text-xs font-black text-sky-700">
                  File: {activityImportFileName}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={activityImportInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(event) =>
                  void readActivityImportFile(event.target.files?.[0] || null)
                }
              />
              <button
                type="button"
                onClick={() => activityImportInputRef.current?.click()}
                className="rounded-xl bg-sky-700 px-4 py-3 text-xs font-black text-white"
              >
                Pilih File Workout
              </button>
              <button
                type="button"
                onClick={downloadWorkoutTemplate}
                className="rounded-xl border border-sky-300 bg-white px-4 py-3 text-xs font-black text-sky-800"
              >
                Download Template Workout
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivityImportOpen(false);
                  setActivityImportRows([]);
                  setActivityImportFileName("");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black text-slate-600"
              >
                Tutup
              </button>
            </div>
          </div>

          {activityImportRows.length ? (
            <>
              <div className="mt-4 overflow-auto rounded-2xl border border-sky-100 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left">Baris</th>
                      <th className="px-3 py-3 text-left">Aktivitas</th>
                      <th className="px-3 py-3 text-left">MET</th>
                      <th className="px-3 py-3 text-left">Kalori/km</th>
                      <th className="px-3 py-3 text-left">Unit</th>
                      <th className="px-3 py-3 text-left">Kategori</th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activityImportRows.slice(0, 100).map((item) => (
                      <tr key={item.row_number}>
                        <td className="px-3 py-3">{item.row_number}</td>
                        <td className="px-3 py-3 font-bold">
                          {item.activity_name || "-"}
                        </td>
                        <td className="px-3 py-3">{item.met || "-"}</td>
                        <td className="px-3 py-3">
                          {item.calories_per_km || "-"}
                        </td>
                        <td className="px-3 py-3">{item.unit || "menit"}</td>
                        <td className="px-3 py-3">
                          {item.category || "-"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-black ${
                              item.valid
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {item.valid ? "Siap" : "Tidak lengkap"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => void importMasterWorkout()}
                disabled={
                  activityImporting || validActivityImportRows.length === 0
                }
                className="mt-4 w-full rounded-2xl bg-sky-700 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {activityImporting
                  ? "Mengimpor Workout..."
                  : `Import ${validActivityImportRows.length} Master Workout`}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={saveFood}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="text-xl font-black text-slate-900">Tambah Makanan</div>
          <div className="mt-4 grid gap-3">
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Nama makanan"
              value={foodForm.food_name || ""}
              onChange={(e) => setFoodForm({ ...foodForm, food_name: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Kalori per 1 porsi"
              value={foodForm.calories || ""}
              onChange={(e) => setFoodForm({ ...foodForm, calories: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Kategori"
              value={foodForm.category || ""}
              onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Alias/sinonim, pisahkan koma"
              value={foodForm.aliases || ""}
              onChange={(e) => setFoodForm({ ...foodForm, aliases: e.target.value })}
            />
            <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">
              Simpan Makanan
            </button>
          </div>
        </form>

        <form
          onSubmit={saveActivity}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="text-xl font-black text-slate-900">Tambah Aktivitas</div>
          <div className="mt-4 grid gap-3">
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Nama aktivitas"
              value={activityForm.activity_name || ""}
              onChange={(e) =>
                setActivityForm({ ...activityForm, activity_name: e.target.value })
              }
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="MET"
              value={activityForm.met || ""}
              onChange={(e) => setActivityForm({ ...activityForm, met: e.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Kalori per km, opsional"
              value={activityForm.calories_per_km || ""}
              onChange={(e) =>
                setActivityForm({ ...activityForm, calories_per_km: e.target.value })
              }
            />
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Kategori"
              value={activityForm.category || ""}
              onChange={(e) =>
                setActivityForm({ ...activityForm, category: e.target.value })
              }
            />
            <button className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
              Simpan Aktivitas
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-black text-slate-900">KaloriData</div>
              <div className="text-sm font-semibold text-slate-500">
                {foodLoading
                  ? "Memuat data..."
                  : `${foodFrom.toLocaleString("id-ID")}–${foodTo.toLocaleString("id-ID")} dari ${foodTotal.toLocaleString("id-ID")} makanan`}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
                placeholder="Cari makanan"
                value={foodSearch}
                onChange={(e) => {
                  setFoodSearch(e.target.value);
                  setFoodPage(1);
                  setFoodSelectedIds([]);
                }}
              />
              {foodSelectedIds.length > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={foodBulkDeleting}
                    onClick={() => setFoodSelectedIds([])}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                  >
                    Batal Pilih
                  </button>
                  <button
                    type="button"
                    disabled={foodBulkDeleting}
                    onClick={() => void deleteSelectedFoods()}
                    className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {foodBulkDeleting
                      ? "Deleting..."
                      : `Delete All (${foodSelectedIds.length.toLocaleString("id-ID")})`}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua makanan di halaman ini"
                    checked={allFoodsOnCurrentPageSelected()}
                    disabled={foodLoading || foodBulkDeleting || foods.length === 0}
                    onChange={toggleAllFoodsOnCurrentPage}
                    className="h-4 w-4 cursor-pointer accent-rose-600"
                  />
                </th>
                <th className="px-4 py-3 text-left">Makanan</th>
                <th className="px-4 py-3 text-left">Kalori / 1 Porsi</th>
                <th className="px-4 py-3 text-left">Kategori</th>
                <th className="px-4 py-3 text-left">Alias</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {foods.map((food) => (
                <tr key={food.id || food.food_name}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${clean(food.food_name) || "makanan"}`}
                      checked={foodSelectedIds.includes(Number(food.id))}
                      disabled={foodBulkDeleting || foodDeletingId === Number(food.id)}
                      onChange={() => toggleFoodSelection(food.id)}
                      className="h-4 w-4 cursor-pointer accent-rose-600"
                    />
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {food.food_name}
                  </td>
                  <td className="px-4 py-3">{food.calories}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {food.category || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {food.aliases || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={foodBulkDeleting || foodDeletingId === Number(food.id)}
                      onClick={() => void deleteFood(food)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {foodDeletingId === Number(food.id) ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-bold text-slate-600">
            Halaman {foodPage.toLocaleString("id-ID")} dari{" "}
            {foodTotalPages.toLocaleString("id-ID")}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={foodLoading || foodPage <= 1}
              onClick={() =>
                setFoodPage((current) => Math.max(current - 1, 1))
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black disabled:opacity-40"
            >
              Sebelumnya
            </button>

            <button
              type="button"
              disabled={
                foodLoading || foodPage >= foodTotalPages
              }
              onClick={() =>
                setFoodPage((current) =>
                  Math.min(current + 1, foodTotalPages),
                )
              }
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-black text-slate-900">Master Workout</div>
              <div className="text-sm font-semibold text-slate-500">
                {activities.length.toLocaleString("id-ID")} aktivitas sesuai pencarian
              </div>
            </div>
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Cari workout / aktivitas"
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Aktivitas</th>
                <th className="px-4 py-3 text-left">MET</th>
                <th className="px-4 py-3 text-left">Kalori / km</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Kategori</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((activity) => (
                <tr key={activity.id || activity.activity_name}>
                  <td className="px-4 py-3 font-bold text-slate-900">{activity.activity_name}</td>
                  <td className="px-4 py-3">{activity.met ?? "-"}</td>
                  <td className="px-4 py-3">{activity.calories_per_km ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{activity.unit || "menit"}</td>
                  <td className="px-4 py-3 text-slate-600">{activity.category || "-"}</td>
                </tr>
              ))}
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-bold text-slate-400">
                    Belum ada aktivitas yang sesuai.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
