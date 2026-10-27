import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = dialog.current!,
      prior = document.activeElement as HTMLElement;
    const scroll = document.documentElement.style.overflow;
    element.showModal();
    document.documentElement.style.overflow = "hidden";
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    element.addEventListener("cancel", cancel);
    return () => {
      element.removeEventListener("cancel", cancel);
      element.close();
      document.documentElement.style.overflow = scroll;
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="dialog-heading"
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="dialog-heading">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
