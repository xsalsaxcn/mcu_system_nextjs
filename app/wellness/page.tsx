import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";
import { redirect } from "next/navigation";

export default function WellnessHomePage() {
  redirect("/wellness/dashboard");
}
