import type { ReactNode } from "react";

interface HelpNoteProps {
  title: string;
  children: ReactNode;
}

export default function HelpNote({ title, children }: HelpNoteProps) {
  return (
    <details className="help-note">
      <summary><span className="help-note-icon" aria-hidden="true">?</span> Giải thích<span className="visually-hidden">: {title}</span></summary>
      <div className="help-note-content"><strong>{title}</strong>{children}</div>
    </details>
  );
}