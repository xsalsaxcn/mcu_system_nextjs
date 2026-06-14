"use client";

// HIDE_QUICK_LOGIN_UPDATE_PASSWORD_V246
// Quick login dinonaktifkan untuk production.
// Komponen tetap ada supaya import di app/layout.tsx tidak error, tapi tidak menampilkan atau mengisi credential apa pun.
export default function LoginQuickAccessAllCapaska() {
  return null;
}