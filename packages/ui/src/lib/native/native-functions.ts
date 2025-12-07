import { runtimeEnv } from "../runtime-env"
import type { NativeDialogOptions } from "./types"
import { openElectronNativeDialog } from "./electron/functions"
import { openTauriNativeDialog } from "./tauri/functions"

export type { NativeDialogOptions, NativeDialogFilter, NativeDialogMode } from "./types"

function resolveNativeHandler(): ((options: NativeDialogOptions) => Promise<string | null>) | null {
  switch (runtimeEnv.host) {
    case "electron":
      return openElectronNativeDialog
    case "tauri":
      return openTauriNativeDialog
    default:
      return null
  }
}

export function supportsNativeDialogs(): boolean {
  return resolveNativeHandler() !== null
}

async function openNativeDialog(options: NativeDialogOptions): Promise<string | null> {
  const handler = resolveNativeHandler()
  if (!handler) {
    return null
  }
  return handler(options)
}

export async function openNativeFolderDialog(options?: Omit<NativeDialogOptions, "mode">): Promise<string | null> {
  return openNativeDialog({ mode: "directory", ...(options ?? {}) })
}

export async function openNativeFileDialog(options?: Omit<NativeDialogOptions, "mode">): Promise<string | null> {
  return openNativeDialog({ mode: "file", ...(options ?? {}) })
}
