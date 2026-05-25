declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      selectFolder: (title?: string) => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      saveCSV: (
        csvContent: string,
        suggestedFilename: string,
      ) => Promise<{
        success: boolean;
        filePath?: string;
        canceled?: boolean;
        error?: string;
      }>;
      getAppVersion: () => Promise<{ version: string }>;
      checkForUpdates: () => void;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => void;
    };
  }
}

export interface UpdateStatus {
  status: "idle" | "checking" | "downloading" | "ready" | "error" | "up-to-date";
  version: string;
  nextVersion?: string;
  error?: string;
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.isElectron;
}

export async function selectFolder(title?: string): Promise<string | null> {
  if (!isElectron() || !window.electronAPI) return null;
  const result = await window.electronAPI.selectFolder(title);
  return result.canceled ? null : result.path;
}

export async function getAppVersion(): Promise<string | null> {
  if (!isElectron() || !window.electronAPI) return null;
  const result = await window.electronAPI.getAppVersion();
  return result.version;
}

export function checkForUpdates(): void {
  if (!isElectron() || !window.electronAPI) return;
  window.electronAPI.checkForUpdates();
}

export function onUpdateStatus(callback: (status: UpdateStatus) => void): (() => void) | undefined {
  if (!isElectron() || !window.electronAPI) return undefined;
  window.electronAPI.onUpdateStatus(callback);
  return () => {
    // ipcRenderer.on subscriptions are persistent; no built-in off needed for one-shot
  };
}

export async function downloadCsv(
  apiUrl: string,
  filename: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const response = await fetch(apiUrl, { credentials: "include" });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV: ${response.status} ${response.statusText}`,
      );
    }
    const csvContent = await response.text();

    const result = await window.electronAPI.saveCSV(csvContent, filename);
    if (!result.success && !result.canceled) {
      throw new Error(result.error ?? "Failed to save CSV");
    }
    return;
  }

  const a = document.createElement("a");
  a.href = apiUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
