"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function WellnessMaster() {
  const [foods, setFoods] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
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

  async function load() {
    const [foodJson, activityJson] = await Promise.all([
      fetch("/api/wellness/reference/foods?limit=2000", {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => ({})),
      fetch("/api/wellness/reference/activities", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({})),
    ]);
    setFoods(foodJson.foods || []);
    setActivities(activityJson.activities || []);
  }

  useEffect(() => {
    void load();
  }, []);

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
    void load();
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
      void load();
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
      void load();
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
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Import Master Data Nutrisi gagal.");
    } finally {
      setImporting(false);
    }
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

  const filteredFoods = useMemo(() => {
    const keyword = foodSearch.trim().toLowerCase();
    return keyword
      ? foods.filter((food) =>
          [food.food_name, food.category, food.aliases]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword),
        )
      : foods;
  }, [foods, foodSearch]);

  const validImportRows = importRows.filter((item) => item.valid);

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
          <div className="mt-2 text-3xl font-black text-slate-900">{foods.length}</div>
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

      <section className="grid gap-3 md:grid-cols-4">
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
                {filteredFoods.length} dari {foods.length} makanan
              </div>
            </div>
            <input
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
              placeholder="Cari makanan"
              value={foodSearch}
              onChange={(e) => setFoodSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Makanan</th>
                <th className="px-4 py-3 text-left">Kalori / 1 Porsi</th>
                <th className="px-4 py-3 text-left">Kategori</th>
                <th className="px-4 py-3 text-left">Alias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFoods.map((food) => (
                <tr key={food.id || food.food_name}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
