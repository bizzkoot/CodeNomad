import { Component, For, Show } from "solid-js"
import type { Instance } from "../types/instance"
import InstanceTab from "./instance-tab"
import KeyboardHint from "./keyboard-hint"
import { Plus, Cast } from "lucide-solid"
import { keyboardRegistry } from "../lib/keyboard-registry"

interface InstanceTabsProps {
  instances: Map<string, Instance>
  activeInstanceId: string | null
  onSelect: (instanceId: string) => void
  onClose: (instanceId: string) => void
  onNew: () => void
  onOpenRemoteAccess?: () => void
}

const InstanceTabs: Component<InstanceTabsProps> = (props) => {
  return (
    <div class="tab-bar tab-bar-instance">
      <div class="tab-container" role="tablist">
        <div class="tab-scroll flex items-center gap-3 overflow-x-auto w-full">
          <div class="flex items-center gap-1 flex-1 min-w-0">
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
              class="new-tab-button"
              onClick={props.onNew}
              title="New instance (Cmd/Ctrl+N)"
              aria-label="New instance"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-auto">
            <Show when={Array.from(props.instances.entries()).length > 1}>
              <div>
                <KeyboardHint
                  shortcuts={[keyboardRegistry.get("instance-prev")!, keyboardRegistry.get("instance-next")!].filter(
                    Boolean,
                  )}
                />
              </div>
            </Show>
            <Show when={Boolean(props.onOpenRemoteAccess)}>
              <button
                class="new-tab-button"
                onClick={() => props.onOpenRemoteAccess?.()}
                title="Remote connect"
                aria-label="Remote connect"
              >
                <Cast class="w-4 h-4" />
              </button>
            </Show>
          </div>
        </div>

      </div>
    </div>
  )
}

export default InstanceTabs
