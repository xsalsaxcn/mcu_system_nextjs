import { redirect } from "next/navigation";

export default function DeleteDatabaseRedirectPage() {
  redirect("/cleanup");
}
