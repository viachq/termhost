import { useMobileStore } from "../store/mobileStore";

export function Toast() {
  const toast = useMobileStore((s) => s.toast);
  if (!toast) return null;
  return <div className="m-toast">{toast}</div>;
}
