import { AtSign, Bell, BellOff, type LucideIcon } from "lucide-react";

import type { NotifyLevel } from "@/contracts/chat";

export const notifyOptions: {
  value: NotifyLevel;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: "all",
    label: "Mọi tin nhắn",
    description: "Thông báo cho mọi tin nhắn mới.",
    icon: Bell
  },
  {
    value: "mentions",
    label: "Chỉ khi nhắc tên",
    description: "Chỉ khi có người @nhắc đến bạn.",
    icon: AtSign
  },
  {
    value: "none",
    label: "Tắt thông báo",
    description: "Kênh được làm mờ, không đếm tin chưa đọc.",
    icon: BellOff
  }
];
