import { useRef } from "react";
import { Icon } from "./Icon";

interface Props {
  onImage: (name: string, base64: string) => void;
  onUpload: (file: File) => void;
  onMenu: () => void;
  onSearch: () => void;
  keysOpen: boolean;
  onToggleKeys: () => void;
}

export function InputRow({ onImage, onUpload, onMenu, onSearch, keysOpen, onToggleKeys }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const base64 = url.split(",")[1] || "";
      if (base64) onImage(file.name, base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onUpload(file);
  };

  return (
    <div className="m-input-row">
      <button className="m-icon-btn menu" onClick={onMenu} aria-label="Home">
        <Icon name="home" />
      </button>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      <input ref={uploadRef} type="file" hidden onChange={handleUpload} />

      <button
        className={`m-icon-btn keys ${keysOpen ? "on" : ""}`}
        onClick={onToggleKeys}
        aria-label="Toggle keys"
      >
        <Icon name="keys" />
      </button>

      <button
        className="m-icon-btn"
        onClick={() => fileRef.current?.click()}
        title="Send a photo to the agent"
        aria-label="Send a photo"
      >
        <Icon name="photo" />
      </button>

      <button
        className="m-icon-btn"
        onClick={() => uploadRef.current?.click()}
        title="Upload a file to the terminal"
        aria-label="Upload a file"
      >
        <Icon name="upload" />
      </button>

      <button
        className="m-icon-btn"
        onClick={onSearch}
        title="Search scrollback"
        aria-label="Search scrollback"
      >
        <Icon name="search" />
      </button>
    </div>
  );
}
