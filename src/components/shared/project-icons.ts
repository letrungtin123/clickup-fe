import {
  BookOpen,
  Briefcase,
  Bug,
  Building2,
  ChartColumn,
  CodeXml,
  Compass,
  Flag,
  Folder,
  Globe,
  Heart,
  Layers,
  Lightbulb,
  Megaphone,
  Package,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Users,
  Workflow,
  Zap,
  type LucideIcon
} from "lucide-react";

/** Icon keys stored in `project.icon` (contract: /^[a-z0-9-]{1,40}$/). */
export const projectIcons = {
  folder: Folder,
  rocket: Rocket,
  briefcase: Briefcase,
  code: CodeXml,
  palette: Palette,
  megaphone: Megaphone,
  target: Target,
  users: Users,
  book: BookOpen,
  bug: Bug,
  chart: ChartColumn,
  globe: Globe,
  layers: Layers,
  zap: Zap,
  heart: Heart,
  star: Star,
  shield: Shield,
  package: Package,
  lightbulb: Lightbulb,
  building: Building2,
  flag: Flag,
  compass: Compass,
  workflow: Workflow,
  sparkles: Sparkles
} as const satisfies Record<string, LucideIcon>;

export type ProjectIconKey = keyof typeof projectIcons;
export const projectIconKeys = Object.keys(projectIcons) as ProjectIconKey[];

export const isProjectIconKey = (value: unknown): value is ProjectIconKey =>
  typeof value === "string" && Object.hasOwn(projectIcons, value);
