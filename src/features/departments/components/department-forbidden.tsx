import { Home, ShieldOff } from "lucide-react";

import { Link } from "@/components/shared/router-link";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { departmentLabels, type Department } from "@/contracts/departments";

/**
 * A route of a department the user does not belong to (PD-041): a calm explanation and the way back, in the style of
 * the not-found page (routes/errors.tsx).
 */
export const DepartmentForbidden = ({ department }: { department: Department }) => (
  <div className="flex h-full items-center justify-center p-4">
    <EmptyState
      icon={ShieldOff}
      title="Bạn không thuộc phòng ban này"
      description={`Trang này thuộc phòng ban ${departmentLabels[department]}. Nếu bạn cần dùng, hãy nhờ quản trị viên thêm bạn vào phòng ban này.`}
      action={
        <Button render={<Link to="/" />} nativeButton={false} variant="outline">
          <Home />
          Về Trang chủ
        </Button>
      }
    />
  </div>
);
