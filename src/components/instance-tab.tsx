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
    <div class="instance-tab-container group">
      <button
        class={`instance-tab inline-flex items-center gap-2 px-3 py-2 rounded-t-md max-w-[200px] transition-colors ${
          props.active ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
        onClick={props.onSelect}
        title={props.instance.folder}
        role="tab"
        aria-selected={props.active}
      >
        <FolderOpen class="w-4 h-4 flex-shrink-0" />
        <span class="tab-label truncate text-sm">
          {props.instance.folder.split("/").pop() || props.instance.folder}
        </span>
        <span
          class="tab-close opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white rounded p-0.5 transition-opacity ml-auto cursor-pointer"
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
