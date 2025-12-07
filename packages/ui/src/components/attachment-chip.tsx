import { Component } from "solid-js"
import type { Attachment } from "../types/attachment"

interface AttachmentChipProps {
  attachment: Attachment
  onRemove: () => void
}

const AttachmentChip: Component<AttachmentChipProps> = (props) => {
  return (
    <div
      class="attachment-chip"
      title={props.attachment.source.type === "file" ? props.attachment.source.path : undefined}
    >
      <span class="font-mono">{props.attachment.display}</span>
      <button
        onClick={props.onRemove}
        class="attachment-remove"
        aria-label="Remove attachment"
      >
        ×
      </button>
    </div>
  )
}

export default AttachmentChip
