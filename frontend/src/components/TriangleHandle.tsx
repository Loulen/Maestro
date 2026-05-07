import { Handle, Position } from "@xyflow/react";
import type { PortSide } from "../types";

const SIDE_TO_POSITION: Record<PortSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function trianglePoints(kind: "input" | "output", side: PortSide): string {
  const inward = kind === "input";
  switch (side) {
    case "left":
      return inward ? "2,5 2,11 10,8" : "10,5 10,11 2,8";
    case "right":
      return inward ? "10,5 10,11 2,8" : "2,5 2,11 10,8";
    case "top":
      return inward ? "5,2 11,2 8,10" : "5,10 11,10 8,2";
    case "bottom":
      return inward ? "5,10 11,10 8,2" : "5,2 11,2 8,10";
  }
}

interface TriangleHandleProps {
  id: string;
  kind: "input" | "output";
  side: PortSide;
  index: number;
  total: number;
  isEdit?: boolean;
}

export default function TriangleHandle({
  id,
  kind,
  side,
  index,
  total,
  isEdit,
}: TriangleHandleProps) {
  const type = kind === "input" ? "target" : "source";
  const position = SIDE_TO_POSITION[side];
  const points = trianglePoints(kind, side);

  const pct = total === 1 ? 50 : ((index + 1) / (total + 1)) * 100;
  const isVerticalSide = side === "left" || side === "right";
  const style: React.CSSProperties = isVerticalSide
    ? { top: `${pct}%`, transform: "translateY(-50%)" }
    : { left: `${pct}%`, transform: "translateX(-50%)" };

  const size = isEdit ? 16 : 16;

  return (
    <Handle
      id={id}
      type={type}
      position={position}
      style={{
        ...style,
        width: size,
        height: size,
        background: "transparent",
        border: "none",
        borderRadius: 0,
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 13 13"
        style={{ pointerEvents: "none" }}
      >
        <polygon
          points={points}
          fill="var(--color-bg-2)"
          stroke="var(--color-bg-5)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </Handle>
  );
}

export { trianglePoints };
