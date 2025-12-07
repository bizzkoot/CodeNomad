import { Component } from "solid-js"
import type { Instance } from "../types/instance"
import { FolderOpen, X } from "lucide-solid"

interface InstanceTabProps {
  instance: Instance
  active: boolean
  onSelect: () => void
  onClose: () => void
}

function formatFolderName(path: string, instances: Instance[], currentInstance: Instance): string {
  const name = path.split("/").pop() || path

  const duplicates = instances.filter((i) => {
    const iName = i.folder.split("/").pop() || i.folder
    return iName === name
  })

  if (duplicates.length > 1) {
    const index = duplicates.findIndex((i) => i.id === currentInstance.id)
    return `~/${name} (${index + 1})`
  }

  return `~/${name}`
}

const InstanceTab: Component<InstanceTabProps> = (props) => {
  return (
    <div class="group">
      <button
        class={`tab-base ${props.active ? "tab-active" : "tab-inactive"}`}
        onClick={props.onSelect}
        title={props.instance.folder}
        role="tab"
        aria-selected={props.active}
      >
        <FolderOpen class="w-4 h-4 flex-shrink-0" />
        <span class="tab-label">
          {props.instance.folder.split("/").pop() || props.instance.folder}
        </span>
        <span
          class="tab-close ml-auto"
          onClick={(e) => {
            e.stopPropagation()
            props.onClose()
          }}
          role="button"
          tabIndex={0}
          aria-label="Close instance"
        >
          <X class="w-3 h-3" />
        </span>
      </button>
    </div>
  )
}

export default InstanceTab
