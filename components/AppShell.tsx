"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/shared/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardCheck,
  Upload,
  Settings,
  Tag,
  GraduationCap,
  FileInput,
  Building,
  Brain,
  Printer,
  FileSearch,
  Trash2,
  Users,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

type MenuItem = [label: string, href: string];

const iconMap: Record<string, React.ElementType> = {
  Dashboard: LayoutDashboard,
  "Registrasi Ulang": ClipboardCheck,
  "Import Peserta": Upload,
  "Setup Parameter": Settings,
  "Setup Label Paket": Tag,
  "Parameter Kelulusan": GraduationCap,
  "Input CAPASKA": FileInput,
  "Input Corporate": Building,
  "AI MCU Analyzer": Brain,
  "Cetak Label": Printer,
  "Review Hasil": FileSearch,
  "Hapus Database": Trash2,
  "Master Users": Users,
};

function menuFor(user: SessionUser): MenuItem[] {
  if (user.role === "admin") {
    return [
      ["Dashboard", "/dashboard"],
      ["Registrasi Ulang", "/registrasi-ulang"],
      ["Import Peserta", "/import"],
      ["Setup Parameter", "/setup-parameters"],
      ["Setup Label Paket", "/setup-label-paket"],
      ["Parameter Kelulusan", "/parameter-kelulusan"],
      ["Input CAPASKA", "/input"],
      ["Input Corporate", "/input-corporate"],
      ["AI MCU Analyzer", "/ai-mcu"],
      ["Cetak Label", "/labels"],
      ["Review Hasil", "/review"],
      ["Hapus Database", "/cleanup"],
      ["Master Users", "/master"],
    ];
  }

  if (user.role === "doctor" || user.role === "supervisor") {
    return [
      ["Dashboard", "/dashboard"],
      ["Review Hasil", "/review"],
    ];
  }

  if (user.program_type === "corporate") {
    return [
      ["Dashboard", "/dashboard"],
      ["Input Corporate", "/input-corporate"],
      ["AI MCU Analyzer", "/ai-mcu"],
    ];
  }

  return [
    ["Dashboard", "/dashboard"],
    ["Input CAPASKA", "/input"],
  ];
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menu = menuFor(user);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <ShieldCheck className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold text-foreground">MCU System</div>
          <div className="text-xs text-muted-foreground">Medical Check-Up</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {menu.map(([label, href]) => {
            const Icon = iconMap[label] || FileInput;
            const isActive = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
                {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground capitalize">
              {user.role} {user.post_name ? `· ${user.post_name}` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card lg:hidden">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>

            <div className="hidden text-sm text-muted-foreground lg:block">
              {menu.find(([, href]) => isActivePath(pathname, href))?.[0] || "Dashboard"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline-block">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {user.role} {user.post_name ? `· ${user.post_name}` : ""}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
