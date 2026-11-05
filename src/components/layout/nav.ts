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
  | "/superadmin"
  | "/superadmin/membros"
  | "/superadmin/inscricoes"
  | "/superadmin/pagamentos"
  | "/superadmin/assinaturas"
  | "/superadmin/comunidades"
  | "/superadmin/grupos"
  | "/superadmin/acessos"
  | "/superadmin/whatsapp"
  | "/superadmin/notificacoes"
  | "/superadmin/relatorios"
  | "/superadmin/utilizadores"
  | "/superadmin/auditoria"
  | "/superadmin/configuracoes";

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
    items: [{ to: "/superadmin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Membros",
    items: [
      { to: "/superadmin/membros", label: "Membros", icon: Users },
      { to: "/superadmin/inscricoes", label: "Inscrições", icon: UserPlus },
      { to: "/superadmin/pagamentos", label: "Pagamentos", icon: CreditCard },
      { to: "/superadmin/assinaturas", label: "Assinaturas", icon: RefreshCcw },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { to: "/superadmin/comunidades", label: "Comunidades", icon: UsersRound },
      { to: "/superadmin/grupos", label: "Grupos WhatsApp", icon: MessageCircle },
      { to: "/superadmin/acessos", label: "Controlo de acesso", icon: ShieldCheck },
      { to: "/superadmin/whatsapp", label: "Integração WhatsApp", icon: Activity },
    ],
  },
  {
    label: "Comunicação e análise",
    items: [
      { to: "/superadmin/notificacoes", label: "Notificações", icon: Bell },
      { to: "/superadmin/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/superadmin/utilizadores", label: "Utilizadores", icon: UserCog },
      { to: "/superadmin/auditoria", label: "Auditoria", icon: FileClock },
      { to: "/superadmin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
