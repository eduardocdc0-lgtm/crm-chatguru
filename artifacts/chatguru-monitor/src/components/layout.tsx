import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquareText,
  Search,
  SendHorizonal,
  Users,
  Smartphone,
  Tag,
  Moon,
  Sun,
  Bell,
  AlertTriangle,
  BarChart2,
  TrendingUp,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { useBrowserNotifications } from "@/hooks/use-notifications";
import { useAuth, type UserRole } from "@/hooks/use-auth";

interface LayoutProps {
  children: React.ReactNode;
  onSearch?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Principal",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Conversas", href: "/conversations", icon: MessageSquareText },
      { name: "Alertas", href: "/alerts", icon: AlertTriangle },
      { name: "Resumos", href: "/summaries", icon: BarChart2, adminOnly: true },
      { name: "Reengajamento", href: "/reengagement", icon: SendHorizonal },
    ],
  },
  {
    label: "Configuração",
    items: [
      { name: "Performance de Tráfego", href: "/traffic", icon: TrendingUp, adminOnly: true },
      { name: "Auditoria de Anúncios", href: "/audit", icon: ShieldAlert, adminOnly: true },
      { name: "Equipe", href: "/team", icon: Users, adminOnly: true },
      { name: "Números", href: "/numbers", icon: Smartphone, adminOnly: true },
      { name: "Tags", href: "/tags", icon: Tag, adminOnly: true },
      { name: "Consultar Número", href: "/check", icon: Search },
    ],
  },
];

function filterItems(items: NavItem[], role: UserRole | null) {
  return items.filter((item) => !item.adminOnly || role === "admin");
}

export function Layout({ children, onSearch }: LayoutProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { requestPermission } = useBrowserNotifications();
  const { role, logout } = useAuth();

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar flex-shrink-0 hidden md:flex md:flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border flex-shrink-0">
          <div className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground flex-1 min-w-0">
            <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground flex-shrink-0 text-sm font-bold">
              ER
            </div>
            <span className="truncate">CRM Eduardo</span>
          </div>
        </div>

        {/* Search button */}
        {onSearch && (
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={onSearch}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/30 border border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors text-sm"
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">Buscar lead...</span>
              <kbd className="text-[10px] border border-sidebar-border rounded px-1 py-0.5 bg-sidebar-accent/30">
                ⌘K
              </kbd>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = filterItems(section.items, role);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <div className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2 px-2">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive =
                      location === item.href ||
                      (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-sidebar-primary/20 text-sidebar-foreground shadow-sm border border-sidebar-primary/20"
                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer sidebar */}
        <div className="px-4 py-3 border-t border-sidebar-border flex items-center gap-2">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            className="flex items-center justify-center w-9 h-9 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={requestPermission}
            title="Ativar notificações"
            className="flex items-center justify-center w-9 h-9 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>
          <span className="text-xs text-sidebar-foreground/30 ml-auto">
            {role === "admin" ? "admin" : "equipe"}
          </span>
          <button
            onClick={handleLogout}
            title="Sair"
            className="flex items-center justify-center w-9 h-9 rounded-md text-sidebar-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 flex-shrink-0 md:hidden">
          <div className="font-bold text-base text-foreground flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              ER
            </div>
            CRM Eduardo
          </div>
          <div className="flex items-center gap-1">
            {onSearch && (
              <button
                onClick={onSearch}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={handleLogout}
              title="Sair"
              className="p-2 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around h-14 px-2">
          {[
            { href: "/", icon: LayoutDashboard, label: "Home" },
            { href: "/conversations", icon: MessageSquareText, label: "Leads" },
            { href: "/alerts", icon: AlertTriangle, label: "Alertas" },
            { href: "/reengagement", icon: SendHorizonal, label: "Reeng." },
            { href: "/check", icon: Search, label: "Consultar" },
          ].map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors text-xs",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-8 pb-20 md:pb-8">
          <div className="mx-auto max-w-6xl w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
