import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { motion } from "motion/react";
import { createContext, useContext, useMemo, type ReactNode, type RefObject, type UIEventHandler } from "react";
import { Tooltip } from "../../components/primitives";
import type { ConversationItem } from "../../lib/runtime";
import type { KoraPresentationMessage } from "./conversation-reconciliation";
import { DUR, EASE } from "../../lib/motion";

type RenderItems = (items: ConversationItem[], options: { live: boolean; role: "user" | "assistant"; createdAt: string }) => ReactNode;
const RenderItemsContext = createContext<RenderItems | undefined>(undefined);
const koraImageAttachmentAdapter = new SimpleImageAttachmentAdapter();

const toThreadMessage = (message: KoraPresentationMessage): ThreadMessageLike => ({
  id: message.id,
  role: message.role,
  createdAt: new Date(message.createdAt),
  ...(message.role === "assistant" ? { status: message.live ? { type: "running" as const } : { type: "complete" as const, reason: "stop" as const } } : {}),
  content: [{ type: "data", name: "kora-items", data: { items: message.items, live: message.live, role: message.role, createdAt: message.createdAt } }],
});

function KoraDataPart({ data }: { data: { items: ConversationItem[]; live: boolean; role: "user" | "assistant"; createdAt: string } }) {
  const renderItems = useContext(RenderItemsContext);
  if (!renderItems) return null;
  return <motion.div
    className={`conversation-item-motion conversation-item-motion--${data.role}`}
    layout={data.live ? "position" : false}
    initial={data.live ? { opacity: 0, y: 9, filter: "blur(2px)" } : false}
    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    transition={{ duration: DUR.base, ease: EASE.out, layout: { duration: DUR.base, ease: EASE.out } }}
  >{renderItems(data.items, { live: data.live, role: data.role, createdAt: data.createdAt })}</motion.div>;
}

const koraPartComponents = { data: { by_name: { "kora-items": KoraDataPart } } } as const;

function KoraMessage() {
  return <MessagePrimitive.Root className="assistant-ui-message">
    <MessagePrimitive.Parts components={koraPartComponents} />
  </MessagePrimitive.Root>;
}

function KoraUserMessage() { return <KoraMessage />; }
function KoraAssistantMessage() { return <div className="assistant-ui-kora-message"><KoraMessage /></div>; }
const koraMessageComponents = { UserMessage: KoraUserMessage, AssistantMessage: KoraAssistantMessage } as const;

export function stabilizeKoraThreadMessages(messages: KoraPresentationMessage[], running: boolean): KoraPresentationMessage[] {
  const last = messages.at(-1);
  if (!running || !last || last.role === "assistant") return messages;
  const assistantId = last.id.endsWith(":user")
    ? `${last.id.slice(0, -":user".length)}:assistant`
    : `${last.id}:assistant`;
  return [...messages, { id: assistantId, role: "assistant", createdAt: last.createdAt, items: [], live: true }];
}

export function KoraAssistantThread({
  messages,
  running,
  renderItems,
  onNew,
  viewportRef,
  onScroll,
  userAwayFromBottom,
  beforeMessages,
  afterMessages,
  composer,
  onCancel,
}: {
  messages: KoraPresentationMessage[];
  running: boolean;
  renderItems: RenderItems;
  onNew: (text: string) => Promise<void>;
  viewportRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
  userAwayFromBottom?: boolean;
  beforeMessages?: ReactNode;
  afterMessages?: ReactNode;
  composer?: ReactNode;
  onCancel?: () => Promise<void>;
}) {
  const stableMessages = useMemo(() => stabilizeKoraThreadMessages(messages, running), [messages, running]);
  const adapter = useMemo(() => ({
    messages: stableMessages,
    convertMessage: toThreadMessage,
    isRunning: running,
    onNew: async (message: AppendMessage) => {
      const text = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim();
      if (text) await onNew(text);
    },
    onCancel,
    adapters: { attachments: koraImageAttachmentAdapter },
  }), [onCancel, onNew, running, stableMessages]);
  const assistantRuntime = useExternalStoreRuntime(adapter);
  return <AssistantRuntimeProvider runtime={assistantRuntime}>
    <RenderItemsContext.Provider value={renderItems}>
      <ThreadPrimitive.Root className="assistant-ui-thread">
        <ThreadPrimitive.Viewport
          ref={viewportRef}
          onScroll={onScroll}
          className="conversation-viewport"
          role="region"
          aria-label="Conversation messages"
          tabIndex={0}
        >
          <div className="conversation-lane">
            {beforeMessages}
            <ThreadPrimitive.Messages components={koraMessageComponents} />
            {afterMessages}
          </div>
        </ThreadPrimitive.Viewport>
        {userAwayFromBottom && <div className="conversation-latest-control"><Tooltip content="Jump to latest" side="left"><ThreadPrimitive.ScrollToBottom className="assistant-ui-scroll-bottom" aria-label="New messages — jump to latest" /></Tooltip></div>}
        {composer}
      </ThreadPrimitive.Root>
    </RenderItemsContext.Provider>
  </AssistantRuntimeProvider>;
}
