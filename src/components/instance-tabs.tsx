import { Component, For, Show } from "solid-js"
import type { Instance } from "../types/instance"
import InstanceTab from "./instance-tab"
import KeyboardHint from "./keyboard-hint"
import { Plus } from "lucide-solid"
import { keyboardRegistry } from "../lib/keyboard-registry"

interface InstanceTabsProps {
  instances: Map<string, Instance>
  activeInstanceId: string | null
  onSelect: (instanceId: string) => void
  onClose: (instanceId: string) => void
  onNew: () => void
}

const InstanceTabs: Component<InstanceTabsProps> = (props) => {
  return (
    <div class="tab-bar tab-bar-instance">
      <div class="tab-container" role="tablist">
        <div class="flex items-center gap-1 overflow-x-auto">
          <For each={Array.from(props.instances.keys())}>
            {(id) => {
              const instance = props.instances.get(id)
              return (
                <InstanceTab
                  instance={instance!}
                  active={id === props.activeInstanceId}
                  onSelect={() => props.onSelect(id)}
                  onClose={() => props.onClose(id)}
                />
              )
            }}
          </For>
          <button
            class="new-tab-button"
            onClick={props.onNew}
            title="New instance (Cmd/Ctrl+N)"
            aria-label="New instance"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>
        <Show when={props.instances.size > 1}>
          <div class="flex-shrink-0 ml-4">
            <KeyboardHint
              shortcuts={[keyboardRegistry.get("instance-prev")!, keyboardRegistry.get("instance-next")!].filter(
                Boolean,
              )}
            />
          </div>
        </Show>
      </div>
    </div>
  )
}

export default InstanceTabs
