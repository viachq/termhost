import { useState, useCallback } from "react";
import type { TreeNode, SplitNode } from "../../types";
import TerminalPane from "../terminal/TerminalPane";
import SplitDivider from "./SplitDivider";
import s from "./SplitPane.module.css";

interface Props {
  node: TreeNode;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
  onTreeUpdate: () => void;
}

export default function SplitContainer({ node, onSplit, onClose, onTreeUpdate }: Props) {
  if (node.type === "leaf") {
    return (
      <TerminalPane
        id={node.id}
        cwd={node._cwd}
        command={node._command}
        onSplit={onSplit}
        onClose={onClose}
      />
    );
  }

  return (
    <SplitView
      node={node}
      onSplit={onSplit}
      onClose={onClose}
      onTreeUpdate={onTreeUpdate}
    />
  );
}

function SplitView({
  node,
  onSplit,
  onClose,
  onTreeUpdate,
}: {
  node: SplitNode;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
  onTreeUpdate: () => void;
}) {
  const [localRatio, setLocalRatio] = useState<number | null>(null);
  const ratio = localRatio ?? node.ratio;

  const handleRatioChange = useCallback((r: number) => {
    setLocalRatio(r);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (localRatio !== null) {
      node.ratio = localRatio;
      setLocalRatio(null);
      onTreeUpdate();
    }
  }, [localRatio, node, onTreeUpdate]);

  const isHorizontal = node.direction === "horizontal";
  const firstBasis = `calc(${ratio * 100}% - 0.5px)`;
  const secondBasis = `calc(${(1 - ratio) * 100}% - 0.5px)`;

  return (
    <div
      className={s.container}
      style={{ flexDirection: isHorizontal ? "row" : "column" }}
    >
      <div className={s.child} style={{ flexBasis: firstBasis, flexGrow: 0, flexShrink: 0 }}>
        <SplitContainer node={node.first} onSplit={onSplit} onClose={onClose} onTreeUpdate={onTreeUpdate} />
      </div>
      <SplitDivider
        direction={node.direction}
        onRatioChange={handleRatioChange}
        onDragEnd={handleDragEnd}
      />
      <div className={s.child} style={{ flexBasis: secondBasis, flexGrow: 0, flexShrink: 0 }}>
        <SplitContainer node={node.second} onSplit={onSplit} onClose={onClose} onTreeUpdate={onTreeUpdate} />
      </div>
    </div>
  );
}
