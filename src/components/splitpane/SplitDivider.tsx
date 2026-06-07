import { useDividerDrag } from "../../hooks/useDividerDrag";
import { useSettingsStore } from "../../store/settingsStore";
import s from "./SplitPane.module.css";

interface Props {
  direction: "horizontal" | "vertical";
  onRatioChange: (ratio: number) => void;
  onDragEnd: () => void;
}

export default function SplitDivider({ direction, onRatioChange, onDragEnd }: Props) {
  const resizeEnabled = useSettingsStore((st) => st.splitResizeEnabled);
  const { onMouseDown } = useDividerDrag(direction, onRatioChange, onDragEnd);

  return (
    <div
      className={`${s.divider} ${direction === "horizontal" ? s.horizontal : s.vertical} ${!resizeEnabled ? s.noResize : ""}`}
      onMouseDown={resizeEnabled ? onMouseDown : undefined}
    />
  );
}
