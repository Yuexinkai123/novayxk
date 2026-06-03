import React from "react";
import { clamp } from "../project/tree";

const LEFT_PANEL_MIN_WIDTH = 268;

export function useWorkspaceLayout() {
  const [leftPanelWidth, setLeftPanelWidth] = React.useState(280);
  const [rightPanelWidth, setRightPanelWidth] = React.useState(400);
  const [bottomPanelHeight, setBottomPanelHeight] = React.useState(272);
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = React.useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = React.useState(false);

  const workspaceStyle: React.CSSProperties = {
    gridTemplateColumns: `${isLeftCollapsed ? "0px" : `${leftPanelWidth}px 6px`} minmax(420px, 1fr) ${
      isRightCollapsed ? "0px" : `6px ${rightPanelWidth}px`
    }`,
  };
  const editorStyle: React.CSSProperties = {
    gridTemplateRows: isBottomCollapsed
      ? "58px minmax(220px, 1fr) 0px"
      : `58px minmax(220px, 1fr) 6px ${bottomPanelHeight}px`,
  };

  const startPanelResize = React.useCallback(
    (event: React.PointerEvent, panel: "left" | "right" | "bottom") => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = leftPanelWidth;
      const startRight = rightPanelWidth;
      const startBottom = bottomPanelHeight;

      const onMove = (moveEvent: PointerEvent) => {
        if (panel === "left") {
          setLeftPanelWidth(clamp(startLeft + moveEvent.clientX - startX, LEFT_PANEL_MIN_WIDTH, 420));
        } else if (panel === "right") {
          setRightPanelWidth(clamp(startRight + startX - moveEvent.clientX, 320, 620));
        } else {
          setBottomPanelHeight(clamp(startBottom + startY - moveEvent.clientY, 180, 420));
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        document.body.classList.remove("is-resizing");
        delete document.body.dataset.resizePanel;
      };

      document.body.classList.add("is-resizing");
      document.body.dataset.resizePanel = panel;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    },
    [bottomPanelHeight, leftPanelWidth, rightPanelWidth],
  );

  return {
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isBottomCollapsed,
    setIsBottomCollapsed,
    workspaceStyle,
    editorStyle,
    startPanelResize,
  };
}
