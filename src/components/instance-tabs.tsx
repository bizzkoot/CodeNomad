import { Component, For } from "solid-js"
import type { Instance } from "../types/instance"
import InstanceTab from "./instance-tab"
import { Plus } from "lucide-solid"

interface InstanceTabsProps {
  instances: Map<string, Instance>
  activeInstanceId: string | null
  onSelect: (instanceId: string) => void
  onClose: (instanceId: string) => void
  onNew: () => void
}

const InstanceTabs: Component<InstanceTabsProps> = (props) => {
  return (
    <div class="instance-tabs bg-gray-50 border-b border-gray-200">
      <div class="tabs-container flex items-center gap-1 px-2 py-1 overflow-x-auto" role="tablist">
        <For each={Array.from(props.instances.entries())}>
          {([id, instance]) => (
            <InstanceTab
              instance={instance}
              active={id === props.activeInstanceId}
              onSelect={() => props.onSelect(id)}
              onClose={() => props.onClose(id)}
            />
          )}
        </For>
        <button
          class="new-tab-button inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-200 transition-colors"
          onClick={props.onNew}
          title="New instance (Cmd/Ctrl+N)"
          aria-label="New instance"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default InstanceTabs
