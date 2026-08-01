"use client";

import { useEffect, useState } from "react";
import { TaskBoardPopup } from "@/components/task-board/TaskBoardPopup";
import { TravelOrderSummaryPanel } from "@/components/task-board/TravelOrderSummaryPanel";

type TravelOrderApprovalModalProps = {
  open: boolean;
  taskId: string | null;
  travelOrderId: string | null;
  title?: string;
  onClose: () => void;
  onUpdated?: () => void;
};

/**
 * Popup for reviewing / approving a travel order from notifications
 * (works for Level 2+ approvers outside the creator's company board).
 */
export function TravelOrderApprovalModal({
  open,
  taskId,
  travelOrderId,
  title,
  onClose,
  onUpdated,
}: TravelOrderApprovalModalProps) {
  const [operatorAgentId, setOperatorAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    void fetch("/api/me/permissions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { operatorAgentId?: string | null } | null) => {
        if (ignore) return;
        setOperatorAgentId(body?.operatorAgentId ?? null);
      })
      .catch(() => {
        if (!ignore) setOperatorAgentId(null);
      });
    return () => {
      ignore = true;
    };
  }, [open]);

  return (
    <TaskBoardPopup
      open={open && Boolean(taskId)}
      title="Travel order"
      description={title?.trim() || "Review and approve this travel order."}
      onClose={onClose}
      size="lg"
    >
      {taskId ? (
        <TravelOrderSummaryPanel
          taskId={taskId}
          focusTravelOrderId={travelOrderId}
          operatorAgentId={operatorAgentId}
          canAssignWork={false}
          canCheckIn={false}
          onKpiSubmitted={onUpdated}
        />
      ) : null}
    </TaskBoardPopup>
  );
}
