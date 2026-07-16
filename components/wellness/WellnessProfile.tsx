"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { prepareWellnessProfilePhoto } from "./profilePhoto";

// WELLNESS_PROFILE_GOOGLE_DRIVE_V76

export type WellnessProfileData = {
  actor_type?: string;
  actor_id?: string;
  name?: string;
  code?: string;
  email?: string;
  photo_url?: string;
  photo_preview_url?: string;
  updated_at?: string;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function initials(name: string) {
  const parts = clean(name).split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "HH";
}

export function useWellnessProfile(enabled = true) {
  const [profile, setProfile] = useState<WellnessProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return null;
    setLoading(true);
    const result = await fetch(`/api/wellness/profile?t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => ({ ok: false }));
    if (result?.ok) setProfile(result.profile || null);
    setLoading(false);
    return result;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const refresh = () => void load();
    window.addEventListener("wellness-profile-updated", refresh);
    return () =>
      window.removeEventListener("wellness-profile-updated", refresh);
  }, [enabled, load]);

  return { profile, loading, reload: load };
}

export function WellnessAvatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-2xl",
  };
  const [imageFailed, setImageFailed] = useState(false);
  const usableSrc = clean(src);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-teal-400 via-cyan-400 to-blue-500 font-black text-white ring-4 ring-white/80 shadow-lg ${sizes[size]} ${className}`}
      aria-label={`Foto profil ${clean(name) || "Wellness"}`}
    >
      {usableSrc && !imageFailed ? (
        <img
          src={usableSrc}
          alt={clean(name) || "Foto profil"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{initials(clean(name))}</span>
      )}
    </div>
  );
}

export function WellnessProfileAvatar({
  name,
  size = "md",
  className = "",
}: {
  actorType?: "participant" | "coach";
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const { profile } = useWellnessProfile(true);
  return (
    <WellnessAvatar
      name={profile?.name || name}
      src={profile?.photo_preview_url || profile?.photo_url}
      size={size}
      className={className}
    />
  );
}

export default function WellnessProfilePanel({
  actorType,
  actor,
  title,
}: {
  actorType: "participant" | "coach";
  actor: any;
  title?: string;
}) {
  const { profile, loading, reload } = useWellnessProfile(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const actorName =
    clean(profile?.name || actor?.name || actor?.full_name || actor?.email) ||
    (actorType === "coach" ? "Coach Wellness" : "Peserta Wellness");
  const actorCode = clean(
    profile?.code || actor?.code || actor?.employee_code || actor?.no_karyawan,
  );
  const actorEmail = clean(
    profile?.email || actor?.email || actor?.portal_email,
  );
  const photo = clean(profile?.photo_preview_url || profile?.photo_url);

  const lastUpdated = useMemo(() => {
    if (!profile?.updated_at) return "Belum ada foto profil";
    const date = new Date(profile.updated_at);
    if (Number.isNaN(date.getTime())) return "Foto profil tersimpan";
    return `Diperbarui ${new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }, [profile?.updated_at]);

  async function uploadPhoto(file?: File | null) {
    if (!file) return;
    setUploading(true);
    setNotice("Menyiapkan foto profil...");
    try {
      const prepared = await prepareWellnessProfilePhoto(file);
      const body = new FormData();
      body.append("file", prepared);
      const result = await fetch("/api/wellness/profile/upload", {
        method: "POST",
        body,
      }).then((response) => response.json());
      if (!result?.ok) throw new Error(result?.message || "Upload foto gagal.");
      setNotice("Foto profil berhasil diperbarui.");
      await reload();
      window.dispatchEvent(new Event("wellness-profile-updated"));
    } catch (error: any) {
      setNotice(error?.message || "Upload foto gagal.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
      <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-800 p-6 text-white">
        <div className="flex items-center gap-4">
          <WellnessAvatar name={actorName} src={photo} size="xl" />
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">
              {actorType === "coach" ? "Coach Profile" : "Participant Profile"}
            </div>
            <h2 className="mt-2 truncate text-2xl font-black">
              {title || actorName}
            </h2>
            <p className="mt-1 text-sm font-bold text-white/70">
              {lastUpdated}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <ProfileInfo label="Nama" value={actorName} />
          <ProfileInfo
            label={actorType === "coach" ? "Coach ID" : "Kode Karyawan"}
            value={actorCode || clean(actor?.id)}
          />
          <ProfileInfo label="Email" value={actorEmail || "-"} />
          <ProfileInfo
            label="Peran"
            value={
              actorType === "coach" ? "Wellness Coach" : "Peserta Wellness"
            }
          />
        </div>

        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-[1.5rem] border border-dashed border-teal-200 bg-teal-50 p-4 transition active:scale-[0.99]">
          <div>
            <div className="text-sm font-black text-teal-950">
              Add Profile Picture
            </div>
            <div className="mt-1 text-xs font-bold leading-5 text-teal-700">
              Foto otomatis dipotong persegi dan dikompres sekitar 20–80 KB.
            </div>
          </div>
          <span className="rounded-full bg-teal-600 px-4 py-2 text-xs font-black text-white">
            {uploading ? "Upload..." : photo ? "Ubah Foto" : "Pilih Foto"}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              void uploadPhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>

        {notice ? (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${/gagal|error/i.test(notice) ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}`}
          >
            {notice}
          </div>
        ) : null}
        {loading ? (
          <div className="mt-3 text-xs font-bold text-slate-400">
            Memuat profil...
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProfileInfo({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-black text-slate-900">
        {clean(value) || "-"}
      </div>
    </div>
  );
}
