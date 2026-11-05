import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  FileClock,
  LayoutDashboard,
  MessageCircle,
  RefreshCcw,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type AdminPath =
  | "/admin"
  | "/admin/membros"
  | "/admin/inscricoes"
  | "/admin/pagamentos"
  | "/admin/assinaturas"
  | "/admin/comunidades"
  | "/admin/grupos"
  | "/admin/acessos"
  | "/admin/whatsapp"
  | "/admin/notificacoes"
  | "/admin/relatorios"
  | "/admin/utilizadores"
  | "/admin/auditoria"
  | "/admin/configuracoes";

export interface NavItem {
  to: AdminPath;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Membros",
    items: [
      { to: "/admin/membros", label: "Membros", icon: Users },
      { to: "/admin/inscricoes", label: "Inscrições", icon: UserPlus },
      { to: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
      { to: "/admin/assinaturas", label: "Assinaturas", icon: RefreshCcw },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { to: "/admin/comunidades", label: "Comunidades", icon: UsersRound },
      { to: "/admin/grupos", label: "Grupos WhatsApp", icon: MessageCircle },
      { to: "/admin/acessos", label: "Controlo de acesso", icon: ShieldCheck },
      { to: "/admin/whatsapp", label: "Integração WhatsApp", icon: Activity },
    ],
  },
  {
    label: "Comunicação e análise",
    items: [
      { to: "/admin/notificacoes", label: "Notificações", icon: Bell },
      { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/admin/utilizadores", label: "Utilizadores", icon: UserCog },
      { to: "/admin/auditoria", label: "Auditoria", icon: FileClock },
      { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
