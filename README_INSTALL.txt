INSTALL AI MCU TRAIN PAGE

Extract ZIP ini ke root project:
C:\Users\Lenovo\Documents\mcu_system_nextjs

File yang akan dibuat:
- app/ai-mcu/train/page.tsx
- app/api/ai-mcu/ml/train/route.ts
- app/api/ai-mcu/ml/predict/route.ts

Setelah extract:
npm run build
git status
git add app\ai-mcu\train\page.tsx app\api\ai-mcu\ml\train\route.ts app\api\ai-mcu\ml\predict\route.ts app\ai-mcu\page.tsx
git commit -m "add ai mcu train page"
git push origin feature/ai-mcu-upload

Tambahkan menu berikut ke app/ai-mcu/page.tsx jika belum ada:
// Tambahkan item ini di app/ai-mcu/page.tsx pada array menuItems
{
  title: "Latih AI",
  href: "/ai-mcu/train",
  desc: "Training machine learning lokal pakai scikit-learn dari data MCU dan feedback dokter.",
},
