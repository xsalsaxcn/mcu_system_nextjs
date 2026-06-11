import { redirect } from "next/navigation";

export default function ShortQrRedirectPage({ params }: { params: { code: string } }) {
  const code = String(params?.code || "").trim();
  redirect("/input?scan=" + encodeURIComponent(code));
}
