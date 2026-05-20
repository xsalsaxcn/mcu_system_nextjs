# Patch v11b - TypeScript Build Fix

Fix error Vercel:

Type error: Type 'number' is not assignable to type 'Record<string, number>'.

Penyebab:
SCORE_RULES berisi key string -> angka, jadi type-nya harus:
Record<string, number>

Bukan:
Record<string, Record<string, number>>

Cara pasang:
1. Upload/replace:
   - app/input/page.tsx
   - app/input-corporate/page.tsx
2. Commit changes.
3. Tunggu Vercel redeploy.
