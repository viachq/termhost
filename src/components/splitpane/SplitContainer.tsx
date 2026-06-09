import { useState, useCallback } from "react";
import type { TreeNode, SplitNode } from "../../types";
import { useTerminalStore } from "../../store/terminalStore";
import TerminalPane from "../terminal/TerminalPane";
import SplitDivider from "./SplitDivider";
import s from "./SplitPane.module.css";

interface Props {
  node: TreeNode;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
  onRotate: (id: string) => void;
  onSwapWithDirection: (sourceId: string, targetId: string, zone: "left" | "right" | "top" | "bottom" | "center") => void;
  onTreeUpdate: () => void;
}

function countLeaves(node: TreeNode): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.first) + countLeaves(node.second);
}

function findLeafNode(node: TreeNode, id: string): TreeNode | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeafNode(node.first, id) || findLeafNode(node.second, id);
}

function leafIndex(node: TreeNode, id: string, counter = { i: 0 }): number {
  if (node.type === "leaf") {
    counter.i++;
    return node.id === id ? counter.i : -1;
  }
  const left = leafIndex(node.first, id, counter);
  if (left > 0) return left;
  return leafIndex(node.second, id, counter);
}

export default function SplitContainer({ node, onSplit, onClose, onRotate, onSwapWithDirection, onTreeUpdate }: Props) {
  const zoomedId = useTerminalStore((st) => st.zoomedTerminalId);
  const leafCount = countLeaves(node);
  const isSinglePane = leafCount === 1;

  if (zoomedId) {
    const leaf = findLeafNode(node, zoomedId);
    if (leaf && leaf.type === "leaf") {
      return (
        <TerminalPane
          id={leaf.id}
          cwd={leaf._cwd}
          command={leaf._command}
          isSinglePane={isSinglePane}
          leafCount={leafCount}
          paneIndex={leafIndex(node, leaf.id)}
          onSplit={onSplit}
          onClose={onClose}
          onRotate={onRotate}
          onSwapWithDirection={onSwapWithDirection}
        />
      );
    }
  }

  if (node.type === "leaf") {
    return (
      <TerminalPane
        id={node.id}
        cwd={node._cwd}
        command={node._command}
        isSinglePane={isSinglePane}
        leafCount={leafCount}
        paneIndex={1}
        onSplit={onSplit}
        onClose={onClose}
        onRotate={onRotate}
        onSwapWithDirection={onSwapWithDirection}
      />
    );
  }

  return (
    <SplitView
      node={node}
      root={node}
      isSinglePane={isSinglePane}
      leafCount={leafCount}
      onSplit={onSplit}
      onClose={onClose}
      onRotate={onRotate}
      onSwapWithDirection={onSwapWithDirection}
      onTreeUpdate={onTreeUpdate}
    />
  );
}

function SplitView({
  node,
  root,
  isSinglePane,
  leafCount,
  onSplit,
  onClose,
  onRotate,
  onSwapWithDirection,
  onTreeUpdate,
}: {
  node: SplitNode;
  root: TreeNode;
  isSinglePane: boolean;
  leafCount: number;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
  onRotate: (id: string) => void;
  onSwapWithDirection: (sourceId: string, targetId: string, zone: "left" | "right" | "top" | "bottom" | "center") => void;
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
        <InnerSplit node={node.first} root={root} isSinglePane={isSinglePane} leafCount={leafCount} onSplit={onSplit} onClose={onClose} onRotate={onRotate} onSwapWithDirection={onSwapWithDirection} onTreeUpdate={onTreeUpdate} />
      </div>
      <SplitDivider
        direction={node.direction}
        onRatioChange={handleRatioChange}
        onDragEnd={handleDragEnd}
      />
      <div className={s.child} style={{ flexBasis: secondBasis, flexGrow: 0, flexShrink: 0 }}>
        <InnerSplit node={node.second} root={root} isSinglePane={isSinglePane} leafCount={leafCount} onSplit={onSplit} onClose={onClose} onRotate={onRotate} onSwapWithDirection={onSwapWithDirection} onTreeUpdate={onTreeUpdate} />
      </div>
    </div>
  );
}

function InnerSplit({
  node,
  root,
  isSinglePane,
  leafCount,
  onSplit,
  onClose,
  onRotate,
  onSwapWithDirection,
  onTreeUpdate,
}: {
  node: TreeNode;
  root: TreeNode;
  isSinglePane: boolean;
  leafCount: number;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
  onRotate: (id: string) => void;
  onSwapWithDirection: (sourceId: string, targetId: string, zone: "left" | "right" | "top" | "bottom" | "center") => void;
  onTreeUpdate: () => void;
}) {
  if (node.type === "leaf") {
    return (
      <TerminalPane
        id={node.id}
        cwd={node._cwd}
        command={node._command}
        isSinglePane={isSinglePane}
        leafCount={leafCount}
        paneIndex={leafIndex(root, node.id)}
        onSplit={onSplit}
        onClose={onClose}
        onRotate={onRotate}
        onSwapWithDirection={onSwapWithDirection}
      />
    );
  }
  return (
    <SplitView
      node={node}
      root={root}
      isSinglePane={isSinglePane}
      leafCount={leafCount}
      onSplit={onSplit}
      onClose={onClose}
      onRotate={onRotate}
      onSwapWithDirection={onSwapWithDirection}
      onTreeUpdate={onTreeUpdate}
    />
  );
}
