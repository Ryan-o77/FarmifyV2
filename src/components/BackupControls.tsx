"use client";

import { useRef, useState } from "react";
import { exportJson, importJson, resetToSeed, clearAll } from "@/lib/clientStore";

/**
 * Backup, restore and reset.
 *
 * Because there is no server, clearing site data would otherwise be the end of a
 * grower's records. This makes the workspace a file they own: one they can keep,
 * email to an agronomist, or carry to another machine.
 */
export function BackupControls({ onChanged }: { onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function download() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `farmify-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "Backup saved to your downloads." });
  }

  async function restore(file: File) {
    const result = importJson(await file.text());
    if (result.ok) {
      setMessage({ tone: "ok", text: "Workspace restored from that file." });
      onChanged();
    } else {
      setMessage({ tone: "bad", text: result.error });
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Your data stays in this browser</h2>
      <p className="mt-1 max-w-2xl text-sm text-soil-600">
        Farmify has no server and no account. Everything you enter is stored on this device
        only, which also means clearing your browser data erases it. Keep a backup file if
        these records matter.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={download}>
          Download backup
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInput.current?.click()}
        >
          Restore from file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (!confirm("Replace everything in this browser with the example farm?")) return;
            resetToSeed();
            setMessage({ tone: "ok", text: "Example farm restored." });
            onChanged();
          }}
        >
          Reset to the example
        </button>
        <button
          type="button"
          className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500"
          onClick={() => {
            if (!confirm("Delete every farm in this browser? This cannot be undone.")) return;
            clearAll();
            setMessage({ tone: "ok", text: "All farms deleted." });
            onChanged();
          }}
        >
          Delete everything
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm font-medium ${
            message.tone === "ok" ? "text-leaf-700" : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
