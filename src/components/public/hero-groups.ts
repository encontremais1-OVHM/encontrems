import {
  Briefcase,
  CakeSlice,
  Code2,
  GraduationCap,
  Handshake,
  Home,
  Lightbulb,
  Scissors,
  ShoppingBag,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import beleza from "@/assets/grupos/beleza.jpg";
import comercio from "@/assets/grupos/comercio.jpg";
import empreendedores from "@/assets/grupos/empreendedores.jpg";
import emprego from "@/assets/grupos/emprego.jpg";
import formacao from "@/assets/grupos/formacao.jpg";
import imobiliario from "@/assets/grupos/imobiliario.jpg";
import negocios from "@/assets/grupos/negocios.jpg";
import pastelaria from "@/assets/grupos/pastelaria.jpg";
import servicos from "@/assets/grupos/servicos.jpg";
import tecnologia from "@/assets/grupos/tecnologia.jpg";

/**
 * Illustrative group categories for the hero animation only. The real
 * catalogue of communities and subgroups always comes from the API.
 */
export interface HeroGroup {
  label: string;
  image: string;
  icon: LucideIcon;
}

const G = {
  beleza: { label: "Salão de Beleza", image: beleza, icon: Scissors },
  imobiliario: { label: "Imobiliárias", image: imobiliario, icon: Home },
  pastelaria: { label: "Pastelarias", image: pastelaria, icon: CakeSlice },
  empreendedores: { label: "Empreendedores", image: empreendedores, icon: Lightbulb },
  emprego: { label: "Oportunidades de Emprego", image: emprego, icon: Briefcase },
  tecnologia: { label: "Tecnologia", image: tecnologia, icon: Code2 },
  servicos: { label: "Prestadores de Serviços", image: servicos, icon: Wrench },
  comercio: { label: "Comércio", image: comercio, icon: ShoppingBag },
  formacao: { label: "Formação", image: formacao, icon: GraduationCap },
  negocios: { label: "Negócios", image: negocios, icon: Handshake },
} satisfies Record<string, HeroGroup>;

/** Three columns; each holds enough tiles to overfill the frame before looping. */
export const HERO_COLUMNS: HeroGroup[][] = [
  [G.beleza, G.empreendedores, G.comercio, G.formacao],
  [G.imobiliario, G.tecnologia, G.negocios],
  [G.pastelaria, G.emprego, G.servicos],
];
