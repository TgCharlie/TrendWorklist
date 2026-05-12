declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      selectFolder: () => Promise<{
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
    };
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.isElectron;
}

export async function selectFolder(): Promise<string | null> {
  if (!isElectron() || !window.electronAPI) return null;
  const result = await window.electronAPI.selectFolder();
  return result.canceled ? null : result.path;
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
