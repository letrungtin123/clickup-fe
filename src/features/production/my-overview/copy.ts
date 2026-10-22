/**
 * PD-081 "Tổng quan của tôi" — every UI string of the page in one place. Vietnamese for now (owner, 2026-10-22); an English
 * version comes later: translate here only.
 */
export const myOverviewCopy = {
  navLabel: "Tổng quan của tôi",
  eyebrow: "Photo Retouch · Tổng quan của tôi",
  greeting: (name: string) => (name ? `Chào ${name}` : "Chào bạn"),
  rangeGroup: "Khoảng thời gian",
  ranges: { today: "Hôm nay", week: "Tuần này", month: "Tháng này", custom: "Tùy chọn" },
  rangeIntro: {
    today: (day: string) => `Hôm nay, ${day}`,
    week: (days: string) => `Tuần này, ${days}`,
    month: (month: string) => `Tháng ${month}`,
    custom: (days: string) => days
  },
  rangeRule: {
    today: "đến hạn hôm nay + task trễ và bị trả sửa từ trước",
    other: "đến hạn trong khoảng + task trễ và bị trả sửa từ trước"
  },
  customTitle: "Chọn khoảng ngày",
  customHint: (max: number) =>
    `Tối đa ${max} ngày. Task chưa xong theo hạn task, task đã xong theo ngày xong.`,
  customApply: "Áp dụng",
  customCancel: "Hủy",
  logTask: "Nhập Task",
  updatedAt: (time: string) => `Cập nhật ${time}`,
  refreshFailed: "Không tải lại được số liệu mới nhất — đang hiện lần tải trước.",
  retry: "Thử lại",
  loading: "Đang tải tổng quan của bạn",
  points: {
    region: "Điểm của tôi",
    today: "Hôm nay",
    week: "Tuần này",
    period: (period: string) => `Kỳ ${period}`,
    unit: "điểm",
    kpiTitle: (period: string) => `KPI kỳ ${period}`,
    kpiValue: (points: string, target: string) => `${points} / ${target} điểm`,
    noTarget: "Chưa có chỉ tiêu KPI kỳ này",
    missingTarget: "Chưa có KPI — báo Quản trị Photo Retouch",
    notRequired: "Không bắt buộc KPI",
    reached: "Đã đạt KPI kỳ này",
    hint: (days: number, perDay: string) =>
      `Còn ${days} ngày làm việc · cần khoảng ${perDay} điểm/ngày để đạt KPI`,
    lastDay: "Kỳ KPI đã hết ngày làm việc",
    openScores: "Mở Bảng điểm",
    periodDays: (from: string, to: string) => `${from} – ${to}`
  },
  tags: {
    region: "Tổng quan task",
    mine: "Việc của tôi",
    inProgress: "Đang làm",
    qc: "Chờ tôi QC",
    done: "Xong",
    late: "Trễ",
    unit: "task",
    images: (images: string) => `${images} tấm`,
    withoutQty: (count: number) => `${count} chưa có số lượng`,
    doneSub: (images: string) => `${images} tấm · được tính điểm`,
    lateSub: "Quá hạn task",
    qcSub: "chờ lâu nhất trước",
    qcLongest: (wait: string) => `lâu nhất ${wait}`,
    filterHint: "Bấm để lọc danh sách, bấm lại để bỏ lọc"
  },
  needs: {
    region: "Cần bạn xử lý",
    title: "Cần bạn xử lý",
    rework: (count: number) => `${count} task bị QC trả sửa`,
    late: (count: number) => `${count} task trễ`,
    dueSoon: (count: number) => `${count} task đến hạn trong 3h`,
    qc: (count: number) => `${count} task chờ bạn QC`,
    qcOver: (count: number) => `${count} quá 2h`,
    qcOverHours: (count: number, hours: string) => `${count} quá ${hours}`
  },
  list: {
    title: "Việc của tôi",
    order: "Bị QC trả sửa trước · rồi task trễ · rồi hạn task gần nhất · task đã xong cuối",
    status: "Trạng thái",
    allStatuses: (count: number) => `Tất cả (${count})`,
    clear: "Bỏ lọc",
    empty: "Không có task nào trong khoảng này.",
    emptyFiltered: "Không có task phù hợp bộ lọc.",
    truncated: (shown: number, total: number) =>
      `Đang hiện ${shown} / ${total} task — thu hẹp khoảng thời gian để xem hết.`,
    noQty: "chưa có số lượng",
    imagesOf: (done: string, assigned: string) => `${done} / ${assigned} tấm`,
    copyFolder: "Copy folder",
    copyFolderLabel: (code: string) => `Sao chép đường dẫn thư mục ảnh của task #${code}`,
    noFolder: "Job chưa có link thư mục",
    copied: "Đã sao chép đường dẫn thư mục",
    copyFailed: "Không sao chép được — giữ để chọn đường dẫn",
    openTask: (code: string) => `Mở task #${code}`,
    qcNote: (name: string) => `QC ${name}:`,
    qcNoteAnonymous: "QC:",
    noNote: "(không ghi chú)"
  },
  deadline: {
    late: (label: string) => `Trễ · ${label}`,
    left: (label: string) => `còn ${label}`,
    dueNow: "đến hạn ngay",
    today: "Hôm nay",
    tomorrow: "Ngày mai",
    inDays: (days: number) => `còn ${days} ngày`,
    passedQc: "Xong · đã qua QC",
    finished: "Xong",
    finishedJob: "Xong · job đã hoàn tất",
    doneOnTime: "Done đúng hạn",
    doneLate: "Done sau hạn task"
  },
  actions: {
    start: "Bắt đầu",
    done: "Done",
    doneField: "Số ảnh xong",
    doneHint: (qc: string | null) =>
      qc ? `Bắt buộc · tự chuyển cho QC ${qc}` : "Bắt buộc · tự chuyển Chờ QC",
    doneHintSubtasks: "Phần của task — subtask giữ số đã giao",
    confirmDone: "Xác nhận Done",
    cancel: "Hủy",
    qtyRequired: "Nhập số ảnh xong.",
    qtyInvalid: "Số ảnh xong phải là số nguyên ≥ 0.",
    qtyAtLeastOne: "Task chưa có số lượng — nhập số ảnh xong (≥ 1).",
    qtyTooHigh: (max: number, assigned: number) =>
      `Tối đa ${max} cho ${assigned} tấm được giao — báo Leader nếu làm nhiều hơn.`,
    doneToast: (code: string) => `Đã Done #${code} — task tự chuyển Chờ QC`,
    startToast: (code: string) => `Đã bắt đầu #${code}`,
    waitingQc: (time: string, wait: string) => `Done ${time} · đang chờ QC ${wait}`,
    checkingQc: (time: string) => `Done ${time} · QC đang check`,
    doneNoQc: (time: string) => `Done ${time} · chờ chuyển QC`,
    readOnly: "Chỉ xem",
    archived: "Job đã lưu trữ"
  },
  qc: {
    title: "Chờ tôi QC",
    order: "Chờ lâu nhất trước",
    back: "Quay lại việc của tôi",
    empty: "Không có task nào chờ bạn QC.",
    by: (name: string, process: string, images: string) => `${name} · ${process} · ${images}`,
    images: (count: string) => `${count} tấm`,
    waiting: (wait: string) => `Chờ ${wait}`,
    justArrived: "Vừa vào chờ QC",
    started: (ago: string) => `Bạn bắt đầu check ${ago}`,
    checking: "Đang check",
    startCheck: "Bắt đầu check",
    pass: "Đạt",
    fail: "Trả sửa",
    failField: "Cần sửa gì",
    failPlaceholder: "Ví dụ: viền nền ảnh 3, 7, 12 chưa sạch",
    failRequired: "Ghi rõ cần sửa gì.",
    sendBack: (name: string) => `Trả cho ${name}`,
    passToast: (code: string) => `Đã check #${code} — điểm được ghi hôm nay`,
    failToast: (code: string, name: string) => `Đã trả #${code} cho ${name}`,
    startToast: (code: string) => `Đang check #${code}`
  },
  ago: {
    now: "vừa xong",
    minutes: (count: number) => `${count} phút trước`,
    hours: (count: number) => `${count} giờ trước`,
    days: (count: number) => `${count} ngày trước`
  },
  errors: {
    title: "Không tải được tổng quan của bạn",
    workflow:
      "Không tải được luồng trạng thái nên chưa hiện nút thao tác. Thử lại, hoặc mở task để làm."
  }
} as const;
