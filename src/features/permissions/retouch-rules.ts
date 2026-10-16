import type { ProductionRole } from "@/contracts/production-catalog";

/**
 * Photo Retouch rules that are NOT configurable yet (PD-042, option A): shown read-only on Cài đặt → Vai trò &
 * phân quyền, exactly as the API enforces them today. Mirrors the API checks (production `assertProductionRole`
 * calls, where ADMIN always passes — except configuration writes, superadmin only since PD-050) and the menu roles in
 * `features/production/nav.ts` — change both together.
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
export const retouchColumns: readonly ProductionRole[] = [
  "ADMIN",
  "ACCOUNT",
  "LEADER",
  "QC",
  "STAFF"
];

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

/**
 * The public settings of Cấu hình → Cài đặt chung that a fixed rule depends on. "Công khai bảng điểm"
 * (`scores_public`) is retired (PD-052): scores are always visible to every member, so it gates nothing here.
 */
export type RetouchPublicSettings = {
  /** "Công khai tiền công" (`money_public`); undefined while unknown. */
  moneyPublic?: boolean | undefined;
};

const onOff = (value: boolean | undefined) =>
  value === undefined ? "" : value ? " (đang bật)" : " (đang tắt)";

/** The fixed rules, in page order. Money depends on the public settings of Cấu hình → Cài đặt chung. */
export const retouchFixedRules = (settings: RetouchPublicSettings = {}): RetouchRule[] => {
  const { moneyPublic } = settings;
  const whenMoney = { partial: "Khi bật “Công khai tiền công”" };
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
      description:
        "Bảng xếp hạng, Điểm cá nhân và điểm từng task của người khác — mọi vai trò luôn xem được (PD-052). Tiền Khoán theo “Công khai tiền công”.",
      cells: everyone
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
    // "Báo cáo" (id "reports", Leader + Quản trị) is hidden from the app for now (owner, 2026-10-16), so it is not
    // listed here either; see features/production/nav.ts.
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
        "Duyệt / từ chối đơn nghỉ và xuất bảng chấm công nghỉ phép: chỉ Quản trị (PD-057). Ai cũng xem lịch nghỉ và gửi đơn.",
      cells: only()
    },
    {
      id: "clients",
      label: "Khách hàng",
      description:
        "Trang Khách hàng: xem khách hàng đặt job. Chỉ Siêu quản trị tạo và sửa khách hàng (PD-050).",
      cells: only("ACCOUNT")
    },
    {
      id: "settings",
      label: "Cấu hình Photo Retouch",
      description:
        "Cấu hình Photo Retouch: chỉ Siêu quản trị sửa; Quản trị xem mọi trang, Account xem Khách hàng, mọi vai trò xem Trạng thái & luồng chuyển.",
      cells: {
        ADMIN: { partial: "Chỉ xem" },
        ACCOUNT: { partial: "Xem Khách hàng, Trạng thái & luồng chuyển" },
        LEADER: { partial: "Chỉ xem Trạng thái & luồng chuyển" },
        QC: { partial: "Chỉ xem Trạng thái & luồng chuyển" },
        STAFF: { partial: "Chỉ xem Trạng thái & luồng chuyển" }
      }
    }
  ];
};
