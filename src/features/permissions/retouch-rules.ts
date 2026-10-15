import type { ProductionRole } from "@/contracts/production-catalog";

/**
 * Photo Retouch rules that are NOT configurable yet (PD-042, option A): shown read-only on Cài đặt → Vai trò &
 * phân quyền, exactly as the API enforces them today. Mirrors the API checks (production `assertProductionRole`
 * calls, where ADMIN always passes) and the menu roles in `features/production/nav.ts` — change both together.
 */

/** A cell: has it, does not, or only partly (the note says how). */
export type RuleCell = boolean | { partial: string };

export type RetouchRule = {
  id: string;
  label: string;
  description: string;
  cells: Record<ProductionRole, RuleCell>;
};

/** Columns of the Photo Retouch matrix, in order (ADMIN first, always everything). */
export const retouchColumns: readonly ProductionRole[] = ["ADMIN", "ACCOUNT", "LEADER", "QC", "STAFF"];

const only = (...roles: ProductionRole[]): Record<ProductionRole, RuleCell> => ({
  ADMIN: true,
  ACCOUNT: roles.includes("ACCOUNT"),
  LEADER: roles.includes("LEADER"),
  QC: roles.includes("QC"),
  STAFF: roles.includes("STAFF")
});

const everyone: Record<ProductionRole, RuleCell> = {
  ADMIN: true,
  ACCOUNT: true,
  LEADER: true,
  QC: true,
  STAFF: true
};

export type RetouchPublicSettings = {
  /** "Công khai bảng điểm" (`scores_public`); undefined while unknown. */
  scoresPublic?: boolean | undefined;
  /** "Công khai tiền công" (`money_public`); undefined while unknown. */
  moneyPublic?: boolean | undefined;
};

const onOff = (value: boolean | undefined) =>
  value === undefined ? "" : value ? " (đang bật)" : " (đang tắt)";

/** The fixed rules, in page order. Two depend on the public settings of Cấu hình → Cài đặt chung. */
export const retouchFixedRules = (settings: RetouchPublicSettings = {}): RetouchRule[] => {
  const { scoresPublic, moneyPublic } = settings;
  const whenScores = { partial: "Khi bật “Công khai bảng điểm”" };
  const whenMoney = { partial: "Khi bật “Công khai tiền công”" };
  const leaderScores = {
    partial: "Điểm các task trong job mình lead (hoặc job chưa có leader)"
  };
  return [
    {
      id: "qc-queue",
      label: "Hàng chờ QC",
      description:
        "Danh sách task chờ kiểm mà mình là người QC. Chỉ người có vai trò QC mới được chọn làm QC của task.",
      cells: only("QC")
    },
    {
      id: "others-scores",
      label: "Xem điểm người khác",
      description: `Bảng xếp hạng và điểm từng task của người khác. Theo cài đặt “Công khai bảng điểm”${onOff(scoresPublic)}; điểm của mình luôn xem được.`,
      cells:
        scoresPublic === true
          ? everyone
          : scoresPublic === false
            ? { ...only(), LEADER: leaderScores }
            : {
                ADMIN: true,
                ACCOUNT: whenScores,
                LEADER: whenScores,
                QC: whenScores,
                STAFF: whenScores
              }
    },
    {
      id: "others-money",
      label: "Xem tiền Khoán người khác",
      description: `Tiền công của người khác trên bảng xếp hạng, chi tiết task và đơn giá. Theo cài đặt “Công khai tiền công”${onOff(moneyPublic)}; báo cáo tiền Khoán luôn chỉ Quản trị.`,
      cells:
        moneyPublic === true
          ? everyone
          : moneyPublic === false
            ? only()
            : {
                ADMIN: true,
                ACCOUNT: whenMoney,
                LEADER: whenMoney,
                QC: whenMoney,
                STAFF: whenMoney
              }
    },
    {
      id: "dashboard",
      label: "Bảng điều khiển",
      description:
        "Tiến độ và khối lượng của team. Leader thấy job mình lead và job chưa có leader; Quản trị xem mọi leader.",
      cells: only("LEADER")
    },
    {
      id: "admin-dashboard",
      label: "Quản trị số liệu",
      description: "Bảng số liệu tổng của Quản trị và các báo cáo được ghim.",
      cells: only()
    },
    {
      id: "reports",
      label: "Báo cáo",
      description:
        "Tạo và lưu báo cáo trên mọi job. Tiền Khoán, trường tùy chỉnh nhân viên và ghim lên bảng số liệu chỉ Quản trị.",
      cells: only("LEADER")
    },
    {
      id: "anomalies",
      label: "Bất thường",
      description:
        "Task bất thường (trễ, lệch số lượng…). Leader thấy job mình lead và job chưa có leader.",
      cells: only("LEADER")
    },
    {
      id: "leave-approval",
      label: "Duyệt lịch nghỉ",
      description:
        "Duyệt / từ chối đơn nghỉ của mọi người (Leader không tự duyệt đơn của mình). Ai cũng xem lịch nghỉ và gửi đơn.",
      cells: only("LEADER")
    },
    {
      id: "clients",
      label: "Khách hàng",
      description: "Trang Khách hàng: xem, tạo và sửa khách hàng đặt job.",
      cells: only("ACCOUNT")
    },
    {
      id: "settings",
      label: "Cấu hình Photo Retouch",
      description:
        "Thành viên & vai trò, danh mục, đơn giá, luồng trạng thái, KPI, cài đặt chung. Account chỉ vào mục Khách hàng.",
      cells: { ...only(), ACCOUNT: { partial: "Chỉ mục Khách hàng" } }
    }
  ];
};
