// WELLNESS_DEFAULT_REFERENCE_V212
// Data referensi dibuat dari workbook Monitoring Nutrisi yang sebelumnya dipakai di Google Sheet.

export type WellnessFoodSeed = { foodName: string; calories: number; category?: string; aliases?: string };
export type WellnessActivitySeed = { activityName: string; met: number | null; caloriesPerKm: number | null; unit?: string; category?: string };

export const WELLNESS_DEFAULT_FOODS: WellnessFoodSeed[] = [
  {
    "foodName": "nasi",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi putih",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi merah",
    "calories": 180.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi uduk",
    "calories": 250.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi kuning",
    "calories": 280.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi goreng",
    "calories": 320.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi liwet",
    "calories": 320.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi kebuli",
    "calories": 350.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi padang",
    "calories": 400.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi campur",
    "calories": 350.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "lontong",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "ketupat",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "lontong sayur",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "lontong opor",
    "calories": 300.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "lontong pecel",
    "calories": 350.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "bubur ayam",
    "calories": 250.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "bubur sumsum",
    "calories": 180.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "bubur kacang hijau",
    "calories": 220.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "bubur ketan hitam",
    "calories": 240.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "mie goreng",
    "calories": 320.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "mie rebus",
    "calories": 280.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "mie ayam",
    "calories": 350.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "bihun goreng",
    "calories": 300.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "soun tumis",
    "calories": 250.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "kentang",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "oyek",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "ketan putih",
    "calories": 220.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "ketan hitam",
    "calories": 240.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "ubi",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "telo",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "jagung",
    "calories": 80.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "ayam",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam goreng",
    "calories": 300.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam rebus",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam bakar",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam suwir",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam filet",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam pillet",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "daging sapi",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "daging sapi goreng",
    "calories": 320.0,
    "category": "Protein"
  },
  {
    "foodName": "daging sapi rebus",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "rendang",
    "calories": 380.0,
    "category": "Protein"
  },
  {
    "foodName": "empal",
    "calories": 350.0,
    "category": "Protein"
  },
  {
    "foodName": "semur daging",
    "calories": 300.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan",
    "calories": 150.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan goreng",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan bakar",
    "calories": 180.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan pindang",
    "calories": 150.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan salem",
    "calories": 180.0,
    "category": "Protein"
  },
  {
    "foodName": "telur",
    "calories": 70.0,
    "category": "Protein"
  },
  {
    "foodName": "telor",
    "calories": 70.0,
    "category": "Protein"
  },
  {
    "foodName": "telur rebus",
    "calories": 70.0,
    "category": "Protein"
  },
  {
    "foodName": "telur goreng",
    "calories": 90.0,
    "category": "Protein"
  },
  {
    "foodName": "telur dadar",
    "calories": 120.0,
    "category": "Protein"
  },
  {
    "foodName": "telur ceplok",
    "calories": 100.0,
    "category": "Protein"
  },
  {
    "foodName": "telur puyuh",
    "calories": 14.0,
    "category": "Protein"
  },
  {
    "foodName": "bebek goreng",
    "calories": 400.0,
    "category": "Protein"
  },
  {
    "foodName": "bebek bakar",
    "calories": 350.0,
    "category": "Protein"
  },
  {
    "foodName": "hati ayam",
    "calories": 150.0,
    "category": "Protein"
  },
  {
    "foodName": "ampela",
    "calories": 120.0,
    "category": "Protein"
  },
  {
    "foodName": "lele goreng",
    "calories": 180.0,
    "category": "Protein"
  },
  {
    "foodName": "cumi",
    "calories": 120.0,
    "category": "Protein"
  },
  {
    "foodName": "udang",
    "calories": 100.0,
    "category": "Protein"
  },
  {
    "foodName": "ikan teri",
    "calories": 80.0,
    "category": "Protein"
  },
  {
    "foodName": "bandeng",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "tuna",
    "calories": 160.0,
    "category": "Protein"
  },
  {
    "foodName": "sarden",
    "calories": 180.0,
    "category": "Protein"
  },
  {
    "foodName": "tahu",
    "calories": 100.0,
    "category": "Nabati"
  },
  {
    "foodName": "tempe",
    "calories": 120.0,
    "category": "Nabati"
  },
  {
    "foodName": "tempe goreng",
    "calories": 150.0,
    "category": "Nabati"
  },
  {
    "foodName": "tahu goreng",
    "calories": 130.0,
    "category": "Nabati"
  },
  {
    "foodName": "gado-gado",
    "calories": 400.0,
    "category": "Sayuran"
  },
  {
    "foodName": "pecel",
    "calories": 400.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayur asem",
    "calories": 80.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayur lodeh",
    "calories": 150.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayur bayam",
    "calories": 50.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayur bening",
    "calories": 50.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sop sayur",
    "calories": 80.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sop daging",
    "calories": 250.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tumis kangkung",
    "calories": 100.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tumis buncis",
    "calories": 80.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayuran",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sayur",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "rebusan",
    "calories": 100.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kukusan",
    "calories": 100.0,
    "category": "Sayuran"
  },
  {
    "foodName": "urap",
    "calories": 150.0,
    "category": "Sayuran"
  },
  {
    "foodName": "lalapan",
    "calories": 50.0,
    "category": "Sayuran"
  },
  {
    "foodName": "brokoli",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kembang kol",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "wortel",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tomat",
    "calories": 20.0,
    "category": "Sayuran"
  },
  {
    "foodName": "timun",
    "calories": 10.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tauge",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kol",
    "calories": 25.0,
    "category": "Sayuran"
  },
  {
    "foodName": "bayam",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "buah",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "buah potong",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "buah segar",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "buah campur",
    "calories": 100.0,
    "category": "Buah"
  },
  {
    "foodName": "buah melon",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "buah semangka",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "pepaya",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "pisang",
    "calories": 90.0,
    "category": "Buah"
  },
  {
    "foodName": "apel",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "pir",
    "calories": 60.0,
    "category": "Buah"
  },
  {
    "foodName": "jeruk",
    "calories": 60.0,
    "category": "Buah"
  },
  {
    "foodName": "jambu",
    "calories": 70.0,
    "category": "Buah"
  },
  {
    "foodName": "anggur",
    "calories": 70.0,
    "category": "Buah"
  },
  {
    "foodName": "mangga",
    "calories": 120.0,
    "category": "Buah"
  },
  {
    "foodName": "alpukat",
    "calories": 160.0,
    "category": "Buah"
  },
  {
    "foodName": "nanas",
    "calories": 60.0,
    "category": "Buah"
  },
  {
    "foodName": "melon",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "semangka",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "buah pir",
    "calories": 60.0,
    "category": "Buah"
  },
  {
    "foodName": "snack",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "camilan",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "gorengan",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "pisang goreng",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "ubi goreng",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "tahu isi",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "risol",
    "calories": 220.0,
    "category": "Camilan"
  },
  {
    "foodName": "pastel",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "lemper",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "onde-onde",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "kue lapis",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "donat",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "martabak manis",
    "calories": 350.0,
    "category": "Camilan"
  },
  {
    "foodName": "kue bolu",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "kue cubit",
    "calories": 150.0,
    "category": "Camilan"
  },
  {
    "foodName": "es teh",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "es jeruk",
    "calories": 120.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus buah",
    "calories": 150.0,
    "category": "Minuman"
  },
  {
    "foodName": "susu",
    "calories": 120.0,
    "category": "Minuman"
  },
  {
    "foodName": "kopi susu",
    "calories": 150.0,
    "category": "Minuman"
  },
  {
    "foodName": "teh manis",
    "calories": 60.0,
    "category": "Minuman"
  },
  {
    "foodName": "air putih",
    "calories": 0.0,
    "category": "Minuman"
  },
  {
    "foodName": "minuman",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "lauk",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "makanan",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "makan siang",
    "calories": 600.0,
    "category": "Umum"
  },
  {
    "foodName": "sarapan",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "makan malam",
    "calories": 500.0,
    "category": "Umum"
  },
  {
    "foodName": "masakan",
    "calories": 150.0,
    "category": "Umum"
  },
  {
    "foodName": "campur",
    "calories": 250.0,
    "category": "Umum"
  },
  {
    "foodName": "hidangan",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "menu",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "salak",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "jus mangga",
    "calories": 150.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus jeruk",
    "calories": 120.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus alpukat",
    "calories": 250.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus pisang",
    "calories": 200.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus campur",
    "calories": 180.0,
    "category": "Minuman"
  },
  {
    "foodName": "es teh manis",
    "calories": 120.0,
    "category": "Minuman"
  },
  {
    "foodName": "teh tawar",
    "calories": 0.0,
    "category": "Minuman"
  },
  {
    "foodName": "kopi hitam",
    "calories": 5.0,
    "category": "Minuman"
  },
  {
    "foodName": "cappuccino",
    "calories": 180.0,
    "category": "Minuman"
  },
  {
    "foodName": "susu putih",
    "calories": 150.0,
    "category": "Minuman"
  },
  {
    "foodName": "susu coklat",
    "calories": 200.0,
    "category": "Minuman"
  },
  {
    "foodName": "yogurt",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "air mineral",
    "calories": 0.0,
    "category": "Minuman"
  },
  {
    "foodName": "es kelapa muda",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "es campur",
    "calories": 250.0,
    "category": "Minuman"
  },
  {
    "foodName": "es buah",
    "calories": 200.0,
    "category": "Minuman"
  },
  {
    "foodName": "cendol",
    "calories": 300.0,
    "category": "Minuman"
  },
  {
    "foodName": "es doger",
    "calories": 350.0,
    "category": "Minuman"
  },
  {
    "foodName": "es teler",
    "calories": 400.0,
    "category": "Minuman"
  },
  {
    "foodName": "wedang jahe",
    "calories": 80.0,
    "category": "Minuman"
  },
  {
    "foodName": "wedang ronde",
    "calories": 200.0,
    "category": "Minuman"
  },
  {
    "foodName": "wedang uwuh",
    "calories": 50.0,
    "category": "Minuman"
  },
  {
    "foodName": "kolak pisang",
    "calories": 250.0,
    "category": "Minuman"
  },
  {
    "foodName": "kolak ubi",
    "calories": 230.0,
    "category": "Minuman"
  },
  {
    "foodName": "bakwan",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "tempe mendoan",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "risoles",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "martabak telur",
    "calories": 400.0,
    "category": "Camilan"
  },
  {
    "foodName": "lumpia",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "cireng",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "cilok",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "siomay",
    "calories": 220.0,
    "category": "Camilan"
  },
  {
    "foodName": "batagor",
    "calories": 300.0,
    "category": "Camilan"
  },
  {
    "foodName": "tahu walik",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "roti bakar",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "kerupuk",
    "calories": 50.0,
    "category": "Camilan"
  },
  {
    "foodName": "emping",
    "calories": 100.0,
    "category": "Camilan"
  },
  {
    "foodName": "kacang goreng",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "kacang rebus",
    "calories": 120.0,
    "category": "Camilan"
  },
  {
    "foodName": "pisang molen",
    "calories": 250.0,
    "category": "Camilan"
  },
  {
    "foodName": "roti isi",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "permen",
    "calories": 40.0,
    "category": "Camilan"
  },
  {
    "foodName": "coklat batangan",
    "calories": 220.0,
    "category": "Camilan"
  },
  {
    "foodName": "biskuit",
    "calories": 150.0,
    "category": "Camilan"
  },
  {
    "foodName": "serabi",
    "calories": 180.0,
    "category": "Camilan"
  },
  {
    "foodName": "klepon",
    "calories": 160.0,
    "category": "Camilan"
  },
  {
    "foodName": "lontong isi",
    "calories": 220.0,
    "category": "Camilan"
  },
  {
    "foodName": "getuk",
    "calories": 150.0,
    "category": "Camilan"
  },
  {
    "foodName": "cenil",
    "calories": 120.0,
    "category": "Camilan"
  },
  {
    "foodName": "putu ayu",
    "calories": 130.0,
    "category": "Camilan"
  },
  {
    "foodName": "nagasari",
    "calories": 160.0,
    "category": "Camilan"
  },
  {
    "foodName": "cucur",
    "calories": 200.0,
    "category": "Camilan"
  },
  {
    "foodName": "nasgor",
    "calories": 320.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi lauk",
    "calories": 350.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi sayur",
    "calories": 300.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "telor kukus",
    "calories": 80.0,
    "category": "Protein"
  },
  {
    "foodName": "telor ceplok",
    "calories": 100.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam sayur",
    "calories": 300.0,
    "category": "Protein"
  },
  {
    "foodName": "bakso seger",
    "calories": 350.0,
    "category": "Protein"
  },
  {
    "foodName": "sayur2an",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "buah potong segar",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "buah2an",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "pt ayam",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "ayam di pt",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "dada ayam filet",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "roti gandum",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "edamame",
    "calories": 120.0,
    "category": "Nabati"
  },
  {
    "foodName": "brokoli rebus",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tomat rebus",
    "calories": 20.0,
    "category": "Sayuran"
  },
  {
    "foodName": "timun rebus",
    "calories": 10.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tales / talas kukus",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "instan oat",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "salad sayur",
    "calories": 120.0,
    "category": "Sayuran"
  },
  {
    "foodName": "rebusan pisang",
    "calories": 100.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "rebusan jagung",
    "calories": 80.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "nasi telur sayur",
    "calories": 350.0,
    "category": "Umum"
  },
  {
    "foodName": "nasi urap ayam",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "ayam pillet sambal tahu buncis",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "salad buah",
    "calories": 150.0,
    "category": "Buah"
  },
  {
    "foodName": "jus mangga tanpa gula",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "buah pir pepaya pisang",
    "calories": 200.0,
    "category": "Buah"
  },
  {
    "foodName": "ayam dan sayur di PT",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "pecel lele kantin musashi",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "tahu tempe bacem",
    "calories": 250.0,
    "category": "Nabati"
  },
  {
    "foodName": "tumis soun kacang panjang",
    "calories": 250.0,
    "category": "Sayuran"
  },
  {
    "foodName": "salad buah + telur rebus",
    "calories": 200.0,
    "category": "Buah"
  },
  {
    "foodName": "brokoli telur jagung",
    "calories": 200.0,
    "category": "Sayuran"
  },
  {
    "foodName": "telur sawi naga pepes",
    "calories": 250.0,
    "category": "Umum"
  },
  {
    "foodName": "sup telur tanpa nasi",
    "calories": 150.0,
    "category": "Sayuran"
  },
  {
    "foodName": "lalap sawi putih",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kopi pahit",
    "calories": 10.0,
    "category": "Minuman"
  },
  {
    "foodName": "singkong ikan tahu",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "ayam tahu tempe",
    "calories": 350.0,
    "category": "Umum"
  },
  {
    "foodName": "sop baso + selada air bawang putih",
    "calories": 300.0,
    "category": "Sayuran"
  },
  {
    "foodName": "bubur kacang hijau tanpa santan",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "salad (kol ungu, wortel, jagung, selada, brokoli, tomat)",
    "calories": 120.0,
    "category": "Sayuran"
  },
  {
    "foodName": "garang asem",
    "calories": 200.0,
    "category": "Sayuran"
  },
  {
    "foodName": "nasi, ayam, telur, sayur asem",
    "calories": 450.0,
    "category": "Umum"
  },
  {
    "foodName": "capcay kuah",
    "calories": 180.0,
    "category": "Sayuran"
  },
  {
    "foodName": "pepes tahu telur asin",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "nasi gado-gado tongkol",
    "calories": 450.0,
    "category": "Umum"
  },
  {
    "foodName": "sop tahu + dada ayam",
    "calories": 300.0,
    "category": "Protein"
  },
  {
    "foodName": "soto tanpa nasi",
    "calories": 250.0,
    "category": "Umum"
  },
  {
    "foodName": "jagung telor buncis tahu",
    "calories": 350.0,
    "category": "Umum"
  },
  {
    "foodName": "dada ayam kukus",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "pepes ikan",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "putih telur",
    "calories": 20.0,
    "category": "Protein"
  },
  {
    "foodName": "telur rebus putihnya saja",
    "calories": 40.0,
    "category": "Protein"
  },
  {
    "foodName": "rebusan ubi labu telur timun selada wortel",
    "calories": 250.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sandwich",
    "calories": 250.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "teh hijau",
    "calories": 5.0,
    "category": "Minuman"
  },
  {
    "foodName": "habbatussauda (kapsul / suplemen)",
    "calories": 10.0,
    "category": "Umum"
  },
  {
    "foodName": "nasi merah pepes ikan",
    "calories": 380.0,
    "category": "Umum"
  },
  {
    "foodName": "nasi merah pare telur tahu",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "pare rebus",
    "calories": 25.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sawi naga (asumsi sawi hijau rebus)",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "selada air bawang putih",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "pepaya pare kubis tahu kukus",
    "calories": 180.0,
    "category": "Sayuran"
  },
  {
    "foodName": "singkong rebus & telur rebus",
    "calories": 250.0,
    "category": "Umum"
  },
  {
    "foodName": "kentang telur urap",
    "calories": 300.0,
    "category": "Umum"
  },
  {
    "foodName": "rebusan ubi, labu, telur, timun, selada, wortel",
    "calories": 250.0,
    "category": "Sayuran"
  },
  {
    "foodName": "nasi jagung",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "umbi-umbian",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "buah naga",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "buah mangga",
    "calories": 120.0,
    "category": "Buah"
  },
  {
    "foodName": "kurma",
    "calories": 50.0,
    "category": "Buah"
  },
  {
    "foodName": "telur dan semangka",
    "calories": 150.0,
    "category": "Buah"
  },
  {
    "foodName": "nasi merah 100gr ayam panggang tanpa kulit sambal rebus",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "nasi merah 100gr tumis bayam 100gr ayam panggang tanpa kulit sambal rebus",
    "calories": 420.0,
    "category": "Umum"
  },
  {
    "foodName": "ayam panggang tanpa kulit",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "tumis bayam",
    "calories": 80.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sop tahu",
    "calories": 200.0,
    "category": "Sayuran"
  },
  {
    "foodName": "tahu kukus",
    "calories": 100.0,
    "category": "Nabati"
  },
  {
    "foodName": "urap ayam",
    "calories": 350.0,
    "category": "Umum"
  },
  {
    "foodName": "sayur tomat hijau",
    "calories": 60.0,
    "category": "Sayuran"
  },
  {
    "foodName": "dada ayam",
    "calories": 220.0,
    "category": "Protein"
  },
  {
    "foodName": "talas",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "oat instan",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "salad",
    "calories": 120.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sambal tahu",
    "calories": 100.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kacang panjang",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "pepes",
    "calories": 200.0,
    "category": "Umum"
  },
  {
    "foodName": "capcay",
    "calories": 180.0,
    "category": "Sayuran"
  },
  {
    "foodName": "pepes tahu",
    "calories": 180.0,
    "category": "Nabati"
  },
  {
    "foodName": "pepes telur asin",
    "calories": 250.0,
    "category": "Protein"
  },
  {
    "foodName": "soun",
    "calories": 200.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "sawi",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "singkong rebus",
    "calories": 150.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "selada air",
    "calories": 40.0,
    "category": "Sayuran"
  },
  {
    "foodName": "bawang putih",
    "calories": 10.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kol ungu",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "selada",
    "calories": 20.0,
    "category": "Sayuran"
  },
  {
    "foodName": "naga (buah naga)",
    "calories": 80.0,
    "category": "Buah"
  },
  {
    "foodName": "pare",
    "calories": 25.0,
    "category": "Sayuran"
  },
  {
    "foodName": "sawi naga (sawi hijau)",
    "calories": 30.0,
    "category": "Sayuran"
  },
  {
    "foodName": "kubis",
    "calories": 25.0,
    "category": "Sayuran"
  },
  {
    "foodName": "labu",
    "calories": 80.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "habbatussauda",
    "calories": 10.0,
    "category": "Umum"
  },
  {
    "foodName": "sop telur",
    "calories": 150.0,
    "category": "Sayuran"
  },
  {
    "foodName": "soto",
    "calories": 250.0,
    "category": "Umum"
  },
  {
    "foodName": "gado2 (variasi dari gado-gado)",
    "calories": 400.0,
    "category": "Sayuran"
  },
  {
    "foodName": "ayam kukus",
    "calories": 200.0,
    "category": "Protein"
  },
  {
    "foodName": "kentang rebus",
    "calories": 120.0,
    "category": "Karbohidrat"
  },
  {
    "foodName": "jus jeruk tanpa gula",
    "calories": 100.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus alpukat tanpa gula",
    "calories": 200.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus pisang tanpa gula",
    "calories": 150.0,
    "category": "Minuman"
  },
  {
    "foodName": "jus campur tanpa gula",
    "calories": 180.0,
    "category": "Minuman"
  },
  {
    "foodName": "nasi merah ayam panggang",
    "calories": 400.0,
    "category": "Umum"
  },
  {
    "foodName": "nasi merah ayam panggang sambal rebus",
    "calories": 420.0,
    "category": "Umum"
  },
  {
    "foodName": "habbatussauda (biji)",
    "calories": 10.0,
    "category": "Umum"
  },
  {
    "foodName": "habbatussauda (minyak)",
    "calories": 40.0,
    "category": "Minyak / Lemak"
  },
  {
    "foodName": "habbatussauda (kapsul)",
    "calories": 3.0,
    "category": "Suplemen"
  },
  {
    "foodName": "somai",
    "calories": 220.0,
    "category": "Camilan"
  },
  {
    "foodName": "siomai",
    "calories": 220.0,
    "category": "Camilan"
  }
];

export const WELLNESS_DEFAULT_ACTIVITIES: WellnessActivitySeed[] = [
  {
    "activityName": "Jalan di tempat",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Stretching",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Yoga",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Hatha",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Vinyasa",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Restorative",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Prenatal",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Pilates",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Mat Pilates",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Reformer Pilates",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Indoor"
  },
  {
    "activityName": "Squat ringan",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Bodyweight Ringan"
  },
  {
    "activityName": "Push-up lutut",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Bodyweight Ringan"
  },
  {
    "activityName": "Plank singkat",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Bodyweight Ringan"
  },
  {
    "activityName": "Wall sit",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Bodyweight Ringan"
  },
  {
    "activityName": "Glute bridge",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Bodyweight Ringan"
  },
  {
    "activityName": "Dance cardio",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Dance Ringan"
  },
  {
    "activityName": "K-pop dance easy",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Dance Ringan"
  },
  {
    "activityName": "Salsa dasar",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Dance Ringan"
  },
  {
    "activityName": "Jalan santai",
    "met": 3.0,
    "caloriesPerKm": 50.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Jalan cepat (brisk walk)",
    "met": 5.0,
    "caloriesPerKm": 70.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Jogging ringan",
    "met": 7.0,
    "caloriesPerKm": 90.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Lari",
    "met": 9.0,
    "caloriesPerKm": 110.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Sepeda santai",
    "met": 4.0,
    "caloriesPerKm": 30.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Sepeda statis ringan",
    "met": 4.0,
    "caloriesPerKm": 25.0,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Hiking ringan",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Tai chi outdoor",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Badminton santai",
    "met": 6.0,
    "caloriesPerKm": 60.0,
    "unit": "km",
    "category": "Outdoor"
  },
  {
    "activityName": "Basket ringan",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Tenis meja",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Frisbee santai",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Outdoor"
  },
  {
    "activityName": "Jumping jack",
    "met": 8.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Side step jack",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Lunges",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Forward lunge",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Side lunge",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Static lunge",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Step-up",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "High knees (pelan)",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Butt kicks (ringan)",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Arm circles",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Bird dog",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Mountain climber (slow)",
    "met": 7.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Donkey kicks",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Calf raises",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Hip circle stretch",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Cat-cow pose",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Wall push-up",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Chair squat",
    "met": 5.0,
    "caloriesPerKm": null,
    "unit": "set",
    "category": "Workout Ringan"
  },
  {
    "activityName": "Jalan kaki sambil telpon",
    "met": 3.0,
    "caloriesPerKm": 50.0,
    "unit": "km",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Naik turun tangga",
    "met": 6.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Menyapu",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Mengepel",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Menyetrika",
    "met": 2.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Menyiram tanaman",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Cabut rumput",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Menanam bunga",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Jalanin anjing",
    "met": 4.0,
    "caloriesPerKm": 50.0,
    "unit": "km",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Main lempar bola",
    "met": 4.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Belanja jalan kaki",
    "met": 3.0,
    "caloriesPerKm": 50.0,
    "unit": "km",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Angkat belanja ringan",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Menjemur pakaian",
    "met": 2.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  },
  {
    "activityName": "Angkat galon pelan",
    "met": 3.0,
    "caloriesPerKm": null,
    "unit": "menit",
    "category": "Aktivitas Harian"
  }
];
