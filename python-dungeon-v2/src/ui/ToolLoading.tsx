import { Code2, RefreshCw, Sparkles } from "lucide-react";
import "./loading.css";

export function ToolLoading({
  scene = false,
  failed,
  onRetry,
}: {
  scene?: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className={`tool-loading ${scene ? "pixel-scene" : "editor-loading"}`}
      role="status"
    >
      {scene ? (
        <Sparkles size={24} aria-hidden="true" />
      ) : (
        <Code2 size={24} aria-hidden="true" />
      )}
      <b>
        {failed
          ? scene
            ? "ฉากยังโหลดไม่ครบ"
            : "โหลดเครื่องมือไม่สำเร็จ"
          : scene
            ? "กำลังเตรียมฉากผจญภัย…"
            : "กำลังเปิดสมุดโค้ด…"}
      </b>
      {!scene && (
        <>
          <p>
            {failed
              ? "ตรวจการเชื่อมต่อ แล้วบันทึกและโหลดหน้าใหม่เพื่อกู้เครื่องมือ"
              : "ครั้งแรกอาจใช้เวลาสักครู่ อ่านภารกิจระหว่างรอได้"}
          </p>
        </>
      )}
      {failed && (
        <button type="button" className="btn secondary" onClick={onRetry}>
          <RefreshCw size={16} /> บันทึกแล้วโหลดใหม่
        </button>
      )}
    </div>
  );
}
