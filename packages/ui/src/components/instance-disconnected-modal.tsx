import { Dialog } from "@kobalte/core/dialog"

interface InstanceDisconnectedModalProps {
  open: boolean
  folder?: string
  reason?: string
  onClose: () => void
}

export default function InstanceDisconnectedModal(props: InstanceDisconnectedModalProps) {
  const folderLabel = props.folder || "this workspace"
  const reasonLabel = props.reason || "The server stopped responding"

  return (
    <Dialog open={props.open} modal>
      <Dialog.Portal>
        <Dialog.Overlay class="modal-overlay" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content class="modal-surface w-full max-w-md p-6 flex flex-col gap-6">
            <div>
              <Dialog.Title class="text-xl font-semibold text-primary">Instance Disconnected</Dialog.Title>
              <Dialog.Description class="text-sm text-secondary mt-2 break-words">
                {folderLabel} can no longer be reached. Close the tab to continue working.
              </Dialog.Description>
            </div>

            <div class="rounded-lg border border-base bg-surface-secondary p-4 text-sm text-secondary">
              <p class="font-medium text-primary">Details</p>
              <p class="mt-2 text-secondary">{reasonLabel}</p>
              {props.folder && (
                <p class="mt-2 text-secondary">
                  Folder: <span class="font-mono text-primary break-all">{props.folder}</span>
                </p>
              )}
            </div>

            <div class="flex justify-end">
              <button type="button" class="selector-button selector-button-primary" onClick={props.onClose}>
                Close Instance
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  )
}
