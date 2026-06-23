import { $, showLoading, toast } from "./dom.js";
import { api } from "./api.js";
import { fmtSize } from "./explorer.js";
import { confirmDialog } from "./dialog.js";

let editorPath = null;
let editorDirty = false;
const editorArea = $("editor-area");

export async function editFile(item, full) {
  showLoading(true);
  try {
    const data = await api("read?path=" + encodeURIComponent(full));
    editorPath = full;
    editorDirty = false;
    $("editor-title").textContent = item.name;
    $("editor-status").textContent = fmtSize(data.size);
    editorArea.value = data.content;
    $("editor").hidden = false;
    editorArea.focus();
    editorArea.setSelectionRange(0, 0);
    editorArea.scrollTop = 0;
  } catch (e) {
    toast(e.message, true);
  } finally {
    showLoading(false);
  }
}

async function saveEditor() {
  if (!editorPath) return;
  const btn = $("editor-save");
  btn.disabled = true;
  try {
    await api("save", { method: "POST", json: { path: editorPath, content: editorArea.value } });
    editorDirty = false;
    $("editor-status").textContent = "✓ kaydedildi";
    toast("Kaydedildi");
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

export async function closeEditor() {
  if (editorDirty && !(await confirmDialog("Kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?", { title: "Kapatılsın mı?", okText: "Kapat", danger: true }))) return;
  $("editor").hidden = true;
  editorPath = null;
  editorDirty = false;
  editorArea.value = "";
}

export function initEditor() {
  editorArea.addEventListener("input", () => {
    if (!editorDirty) {
      editorDirty = true;
      $("editor-status").textContent = "• kaydedilmedi";
    }
  });

  editorArea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = editorArea.selectionStart, en = editorArea.selectionEnd;
      editorArea.value = editorArea.value.slice(0, s) + "\t" + editorArea.value.slice(en);
      editorArea.selectionStart = editorArea.selectionEnd = s + 1;
      editorArea.dispatchEvent(new Event("input"));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveEditor();
    }
  });

  $("editor-save").addEventListener("click", saveEditor);
  $("editor-close").addEventListener("click", closeEditor);
}
