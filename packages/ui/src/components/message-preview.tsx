import type { Component } from "solid-js"
import MessageItem from "./message-item"
import type { MessageRecord } from "../stores/message-v2/types"
import type { MessageInfo } from "../types/message"

interface MessagePreviewProps {
  record: MessageRecord
  messageInfo?: MessageInfo
  instanceId: string
  sessionId: string
}

const MessagePreview: Component<MessagePreviewProps> = (props) => {
  return (
    <div class="message-preview">
      <MessageItem
        record={props.record}
        messageInfo={props.messageInfo}
        instanceId={props.instanceId}
        sessionId={props.sessionId}
        parts={props.record.partIds.map((id) => props.record.parts[id]?.data).filter((part): part is NonNullable<typeof part> => Boolean(part))}
      />
    </div>
  )
}

export default MessagePreview
