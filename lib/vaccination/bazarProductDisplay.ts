// V618: Presentation-only Bazar catalogue labels. DO NOT change product identifiers, prices or clinical eligibility.
export type BazarDisplay = { title: string; subtitle: string; keywords: string; category: "VAKSIN" | "VITAMIN" };

const LABELS: ReadonlyArray<readonly [RegExp, BazarDisplay]> = [
  [/^AVAXIM\s+ADULT\b/i, { title: "Vaksin Hepatitis A (Dewasa)", subtitle: "Untuk membantu melindungi dari infeksi Hepatitis A", keywords: "hepatitis a hati", category: "VAKSIN" }],
  [/^BIOTCV\b/i, { title: "Vaksin Tifoid (Tipes)", subtitle: "Untuk membantu mencegah demam tifoid", keywords: "tifoid tipes typhoid", category: "VAKSIN" }],
  [/^BOOSTRIX\b/i, { title: "Vaksin Tetanus, Difteri & Batuk Rejan", subtitle: "Perlindungan terhadap tetanus, difteri dan pertusis", keywords: "tetanus difteri pertusis batuk rejan tdap", category: "VAKSIN" }],
  [/^EUVAX\b/i, { title: "Vaksin Hepatitis B", subtitle: "Untuk membantu melindungi dari infeksi Hepatitis B", keywords: "hepatitis b hati", category: "VAKSIN" }],
  [/^FORMENING\b/i, { title: "Vaksin Meningitis Meningokokus", subtitle: "Untuk membantu mencegah penyakit meningokokus", keywords: "meningitis meningokokus", category: "VAKSIN" }],
  [/^GARDASIL\s*9\b/i, { title: "Vaksin HPV", subtitle: "Membantu mencegah penyakit akibat HPV, termasuk kanker serviks", keywords: "hpv serviks human papilloma virus", category: "VAKSIN" }],
  [/^INFLUVAC\s+TETRA\b/i, { title: "Vaksin Influenza (Flu)", subtitle: "Untuk membantu mencegah influenza (flu)", keywords: "influenza flu", category: "VAKSIN" }],
  [/^LARCE\b/i, { title: "Suntik Vitamin C", subtitle: "Layanan injeksi vitamin C", keywords: "vitamin c injeksi suntik", category: "VITAMIN" }],
  [/^LYOVEN\b/i, { title: "Suntik Multivitamin", subtitle: "Layanan injeksi multivitamin", keywords: "multivitamin injeksi suntik", category: "VITAMIN" }],
  [/^MERSIBION\b/i, { title: "Suntik Vitamin B", subtitle: "Layanan injeksi vitamin B", keywords: "vitamin b injeksi suntik", category: "VITAMIN" }],
  [/^PREVENAR\s*20\b/i, { title: "Vaksin Pneumokokus", subtitle: "Untuk membantu melindungi dari penyakit pneumokokus, termasuk pneumonia", keywords: "pneumokokus pneumonia paru", category: "VAKSIN" }],
  [/^QDENGA\b/i, { title: "Vaksin Demam Berdarah (Dengue)", subtitle: "Vaksin untuk membantu mencegah penyakit dengue / DBD", keywords: "dengue demam berdarah dbd", category: "VAKSIN" }],
  [/^SHINGRIX\b/i, { title: "Vaksin Cacar Api (Herpes Zoster)", subtitle: "Untuk membantu mencegah herpes zoster (cacar api)", keywords: "cacar api herpes zoster shingles", category: "VAKSIN" }],
  [/^TWINRIX\b/i, { title: "Vaksin Hepatitis A & B", subtitle: "Untuk membantu melindungi dari Hepatitis A dan Hepatitis B", keywords: "hepatitis a b hati", category: "VAKSIN" }],
];

export function bazarProductDisplay(vaccineName: string): BazarDisplay {
  const name = String(vaccineName || "").trim();
  const hit = LABELS.find(([regex]) => regex.test(name));
  if (hit) return hit[1];
  // Never guess the medical indication of an unknown future product.
  return {
    title: name || "Produk Bazar",
    subtitle: "Tanyakan kegunaan dan kecocokan produk kepada petugas kesehatan",
    keywords: name,
    category: /vitamin|multivitamin|injeksi/i.test(name) ? "VITAMIN" : "VAKSIN",
  };
}
