import type { Page } from "@playwright/test";

/** Use native editing events: Firefox's contenteditable fill bypasses CodeMirror. */
export async function writePython(page: Page, code: string) {
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await editor.click();
  await editor.press("ControlOrMeta+a");
  await editor.press("Backspace");
  if (code) await page.keyboard.insertText(code);
}
