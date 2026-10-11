import type {
  KnowledgeAccessLevel,
  KnowledgeImportance,
  KnowledgeItemQuery,
  KnowledgeStatusGroup
} from "@/contracts/knowledge";
import type { ColorToken } from "@/contracts/work";

/**
 * Vietnamese wording of the knowledge base ("Kho tri thức", PD-031). One place so the sidebar, lists,
 * filters, item page, audit log and notifications always say the same thing.
 */

export const importanceOrder: readonly KnowledgeImportance[] = ["critical", "important", "normal"];

export const importanceMeta: Record<
  KnowledgeImportance,
  { label: string; short: string; color: ColorToken; description: string; rank: number }
> = {
  normal: {
    label: "Bình thường",
    short: "Thường",
    color: "slate",
    description: "Hướng dẫn, quy trình dùng hằng ngày.",
    rank: 0
  },
  important: {
    label: "Quan trọng",
    short: "Quan trọng",
    color: "amber",
    description: "Sai sẽ ảnh hưởng chất lượng hoặc khách hàng.",
    rank: 1
  },
  critical: {
    label: "Rất quan trọng",
    short: "Rất quan trọng",
    color: "red",
    description: "Chính sách, quy định bắt buộc. Mọi thay đổi cần ghi lý do.",
    rank: 2
  }
};

export const statusGroupOrder: readonly KnowledgeStatusGroup[] = ["draft", "active", "retired"];

export const statusGroupMeta: Record<
  KnowledgeStatusGroup,
  { label: string; description: string }
> = {
  draft: {
    label: "Bản nháp",
    description: "Đang soạn hoặc chờ duyệt. Chỉ người soạn, Thành viên và Quản lý của kho thấy."
  },
  active: {
    label: "Đang áp dụng",
    description: "Thông tin chính thức. Mọi người xem được kho đều thấy và tìm được."
  },
  retired: {
    label: "Hết hiệu lực",
    description: "Không còn áp dụng, giữ để tra cứu, luôn kèm nhãn cảnh báo."
  }
};

export const accessLevelOrder: readonly KnowledgeAccessLevel[] = ["view", "submit", "manage"];

export const accessLevelMeta: Record<KnowledgeAccessLevel, { label: string; description: string }> =
  {
    view: { label: "Chỉ xem", description: "Đọc mục đang áp dụng, bình luận, @nhắc tên, theo dõi." },
    submit: {
      label: "Thành viên",
      description: "Tạo và sửa mục, đổi trạng thái, khôi phục phiên bản, xoá vào thùng rác."
    },
    manage: {
      label: "Quản lý",
      description: "Ban hành, thành viên, trạng thái, chuyên mục, nhật ký kho, xoá vĩnh viễn."
    }
  };

export type KnowledgeSort = KnowledgeItemQuery["sort"];

export const sortOptions: readonly { value: KnowledgeSort; label: string }[] = [
  { value: "updated", label: "Mới cập nhật" },
  { value: "importance", label: "Mức quan trọng" },
  { value: "title", label: "Tên (A → Z)" },
  { value: "reviewBy", label: "Hạn rà soát gần nhất" },
  { value: "created", label: "Mới tạo" }
];

export const visibilityMeta = {
  public: {
    label: "Công khai",
    description: "Mọi người có quyền xem tri thức đều đọc, bình luận và @nhắc tên. Sửa cần là Thành viên của kho."
  },
  private: {
    label: "Riêng tư",
    description: "Chỉ người được mời vào kho mới thấy kho trong danh sách và kết quả tìm kiếm."
  }
} as const;
