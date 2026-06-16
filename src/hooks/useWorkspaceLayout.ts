import React from "react";
import { clamp } from "../project/tree";
import type { WorkspaceLayoutConfig } from "../vite-env";

const LEFT_PANEL_MIN_WIDTH = 268;
const RIGHT_PANEL_MIN_WIDTH = 320;
const WORKSPACE_HORIZONTAL_PADDING = 28;
const RESIZE_HANDLE_SIZE = 6;
const MIN_CENTER_WIDTH_WITH_SIDEBAR = 320;
const MIN_CENTER_WIDTH_WITHOUT_SIDEBAR = 96;

function getMaxRightPanelWidth(viewportWidth: number) {
  return Math.max(RIGHT_PANEL_MIN_WIDTH, viewportWidth - WORKSPACE_HORIZONTAL_PADDING - RESIZE_HANDLE_SIZE);
}

function getSidebarAutoHideWidth(viewportWidth: number) {
  return viewportWidth - WORKSPACE_HORIZONTAL_PADDING - LEFT_PANEL_MIN_WIDTH - RESIZE_HANDLE_SIZE * 2 - MIN_CENTER_WIDTH_WITH_SIDEBAR + 1;
}

function getCenterAutoHideWidth(viewportWidth: number) {
  return viewportWidth - WORKSPACE_HORIZONTAL_PADDING - RESIZE_HANDLE_SIZE - MIN_CENTER_WIDTH_WITHOUT_SIDEBAR + 1;
}

type UseWorkspaceLayoutOptions = {
  initialLayout?: WorkspaceLayoutConfig;
  onLayoutChange?: (layout: WorkspaceLayoutConfig) => void;
};

function normalizeInitialWidth(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export function useWorkspaceLayout({ initialLayout, onLayoutChange }: UseWorkspaceLayoutOptions = {}) {
  const [leftPanelWidth, setLeftPanelWidth] = React.useState(() => normalizeInitialWidth(initialLayout?.leftPanelWidth, 280));
  const [rightPanelWidth, setRightPanelWidth] = React.useState(() => normalizeInitialWidth(initialLayout?.rightPanelWidth, 400));
  const [bottomPanelHeight, setBottomPanelHeight] = React.useState(() => normalizeInitialWidth(initialLayout?.bottomPanelHeight, 272));
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(initialLayout?.isLeftCollapsed === true);
  const [isRightCollapsed, setIsRightCollapsed] = React.useState(initialLayout?.isRightCollapsed === true);
  const [isBottomCollapsed, setIsBottomCollapsed] = React.useState(initialLayout?.isBottomCollapsed === true);
  const [viewportWidth, setViewportWidth] = React.useState(() => window.innerWidth);

  React.useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const didHydrateLayoutRef = React.useRef(false);

  React.useEffect(() => {
    if (!onLayoutChange) return;
    if (!didHydrateLayoutRef.current) {
      didHydrateLayoutRef.current = true;
      return;
    }
    const timeout = window.setTimeout(() => {
      onLayoutChange({
        leftPanelWidth,
        rightPanelWidth,
        bottomPanelHeight,
        isLeftCollapsed,
        isRightCollapsed,
        isBottomCollapsed,
      });
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [
    bottomPanelHeight,
    isBottomCollapsed,
    isLeftCollapsed,
    isRightCollapsed,
    leftPanelWidth,
    onLayoutChange,
    rightPanelWidth,
  ]);

  const isStackedLayout = viewportWidth <= 1180;

  const leftAutoHidden =
    !isStackedLayout &&
    !isRightCollapsed &&
    !isLeftCollapsed &&
    rightPanelWidth >= getSidebarAutoHideWidth(viewportWidth);

  const centerAutoHidden =
    !isStackedLayout &&
    !isRightCollapsed &&
    rightPanelWidth >= getCenterAutoHideWidth(viewportWidth);

  const isSidebarVisible = !isLeftCollapsed && (!leftAutoHidden || isStackedLayout);
  const isCenterVisible = !centerAutoHidden || isStackedLayout;
  const isOnlyAssistantVisible = !isStackedLayout && !isRightCollapsed && !isSidebarVisible && !isCenterVisible;

  const previousLayoutRef = React.useRef({
    viewportWidth,
    isSidebarVisible,
    isCenterVisible,
  });

  React.useLayoutEffect(() => {
    const previousLayout = previousLayoutRef.current;
    const viewportChanged = previousLayout.viewportWidth !== viewportWidth;
    if (!viewportChanged) {
      previousLayoutRef.current = {
        viewportWidth,
        isSidebarVisible,
        isCenterVisible,
      };
      return;
    }

    let nextRightPanelWidth = Math.min(rightPanelWidth, getMaxRightPanelWidth(viewportWidth));

    if (!isStackedLayout && !isRightCollapsed && viewportWidth > previousLayout.viewportWidth) {
      if (!previousLayout.isCenterVisible) {
        nextRightPanelWidth = getMaxRightPanelWidth(viewportWidth);
      } else if (!previousLayout.isSidebarVisible) {
        nextRightPanelWidth = Math.max(nextRightPanelWidth, Math.min(getMaxRightPanelWidth(viewportWidth), getSidebarAutoHideWidth(viewportWidth)));
      }
    }

    if (nextRightPanelWidth !== rightPanelWidth) {
      setRightPanelWidth(nextRightPanelWidth);
    }

    previousLayoutRef.current = {
      viewportWidth,
      isSidebarVisible,
      isCenterVisible,
    };
  }, [isCenterVisible, isRightCollapsed, isSidebarVisible, isStackedLayout, rightPanelWidth, viewportWidth]);

  const desktopColumns = isOnlyAssistantVisible
    ? [`${RESIZE_HANDLE_SIZE}px`, "minmax(0, 1fr)"]
    : [
        ...(isSidebarVisible ? [`${leftPanelWidth}px`, `${RESIZE_HANDLE_SIZE}px`] : []),
        ...(isCenterVisible ? ["minmax(0, 1fr)"] : []),
        ...(isRightCollapsed ? [] : [`${RESIZE_HANDLE_SIZE}px`, `${rightPanelWidth}px`]),
      ];

  const workspaceStyle: React.CSSProperties = {
    gridTemplateColumns: isStackedLayout
      ? "minmax(0, 1fr)"
      : desktopColumns.join(" "),
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
          setRightPanelWidth(clamp(startRight + startX - moveEvent.clientX, RIGHT_PANEL_MIN_WIDTH, getMaxRightPanelWidth(viewportWidth)));
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
    [bottomPanelHeight, leftPanelWidth, rightPanelWidth, viewportWidth],
  );

  return {
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isBottomCollapsed,
    setIsBottomCollapsed,
    isSidebarVisible,
    isCenterVisible,
    workspaceStyle,
    editorStyle,
    startPanelResize,
  };
}
