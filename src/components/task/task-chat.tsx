"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { upload } from "@vercel/blob/client";
import {
  Send,
  Paperclip,
  X,
  Sparkles,
  Square,
  Loader2,
  Hammer,
  Check,
  RotateCcw,
  Mic,
} from "lucide-react";

// Minimal Web Speech API shape — the DOM lib doesn't include these types.
type SpeechRecognitionResult = { 0: { transcript: string } };
type SpeechRecognitionEvent = { results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
import { ATTACH_EVENT } from "@/components/task/photo-uploader";
import { resetForemanThread } from "@/app/actions";

export const ASK_EVENT = "reno:ask-foreman";

type Attachment = { url: string; mediaType: string };

function guessType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes(".png")) return "image/png";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

const TOOL_LABELS: Record<string, string> = {
  "tool-setProjectBrief": "Updated project brief",
  "tool-updateProjectDetails": "Updated project",
  "tool-deleteTask": "Deleted a task",
  "tool-deletePhase": "Deleted a phase",
  "tool-addTask": "Added a task",
  "tool-setTaskStatus": "Updated status",
  "tool-moveTask": "Reordered tasks",
  "tool-moveTaskToPhase": "Moved task to phase",
  "tool-movePhase": "Reordered phases",
  "tool-renamePhase": "Renamed phase",
  "tool-mergePhases": "Merged phases",
  "tool-updateTaskGuide": "Rewrote the plan",
  "tool-editTaskDetails": "Edited task details",
  "tool-addNote": "Added a note",
  "tool-addBuyItem": "Added to buy list",
  "tool-logTime": "Logged time",
  "tool-recordOwnedTool": "Saved to your toolbox",
  "tool-remember": "Saved to memory",
  "tool-forget": "Updated memory",
  "tool-setPropertyDetails": "Saved the place",
};

export function TaskChat({
  projectId,
  taskId = null,
  initialMessages,
}: {
  projectId: string;
  taskId?: string | null;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, taskId: taskId ?? null },
    }),
    // When the Foreman finishes, re-pull server data so any task changes
    // his tools made (status, notes, time, buy list) appear immediately.
    onFinish: () => router.refresh(),
  });

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaselineRef = useRef("");
  const busy = status === "submitted" || status === "streaming";

  // Browser voice support — Chromium has SpeechRecognition, Safari (incl.
  // iOS 16+) has webkitSpeechRecognition, Firefox lacks both so the mic
  // button stays hidden. useSyncExternalStore avoids hydration mismatch
  // without the setState-in-effect anti-pattern.
  const voiceSupported = useSyncExternalStore(
    () => () => {},
    () =>
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    () => false,
  );

  function startVoice() {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    // Keep whatever the user already typed; append the transcript after it.
    voiceBaselineRef.current = input;
    r.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      const base = voiceBaselineRef.current;
      setInput(base + (base && transcript ? " " : "") + transcript);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);
    try {
      r.start();
      recognitionRef.current = r;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function stopVoice() {
    recognitionRef.current?.stop();
  }

  // If the component unmounts mid-recording (modal close), kill the
  // recognition so the mic doesn't keep listening.
  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    function onAsk(e: Event) {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      if (!text) return;
      sendMessage({ text });
      document
        .getElementById("foreman")
        ?.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [sendMessage]);

  useEffect(() => {
    function onAttach(e: Event) {
      const { url } = (e as CustomEvent<{ url: string }>).detail;
      setAttachments((a) =>
        a.some((x) => x.url === url)
          ? a
          : [...a, { url, mediaType: guessType(url) }],
      );
      fileRef.current
        ?.closest("section")
        ?.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener(ATTACH_EVENT, onAttach);
    return () => window.removeEventListener(ATTACH_EVENT, onAttach);
  }, []);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const next: Attachment[] = [];
      for (const file of Array.from(files)) {
        const blob = await upload(
          `projects/${projectId}/chat/${file.name}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            clientPayload: JSON.stringify({ projectId }),
          },
        );
        next.push({ url: blob.url, mediaType: file.type || guessType(blob.url) });
      }
      setAttachments((a) => [...a, ...next]);
    } catch {
      /* surfaced by disabled state; keep UI simple */
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    sendMessage({
      text: text || "What should I know about this?",
      files: attachments.map((a) => ({
        type: "file" as const,
        mediaType: a.mediaType,
        url: a.url,
      })),
    });
    setInput("");
    setAttachments([]);
  }

  async function startFresh() {
    if (resetting || busy) return;
    if (
      !confirm(
        "Start fresh? This clears this conversation. The Foreman keeps what it has remembered.",
      )
    )
      return;
    setResetting(true);
    try {
      await resetForemanThread(projectId, taskId ?? null);
      setMessages([]);
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <section id="foreman">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-blueprint text-white">
            <Hammer className="size-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">The Foreman</p>
            <p className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
              Renovation expert · sees your photos
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={startFresh}
            disabled={resetting || busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-2 font-mono text-[10px] tracking-wide text-ink-soft uppercase transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
            aria-label="Start a fresh conversation (keeps what the Foreman remembers)"
          >
            {resetting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Start fresh
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong bg-paper px-4 py-6 text-center">
            <Sparkles className="mx-auto size-5 text-brass" />
            <p className="mt-2 text-sm text-ink-soft">
              Stuck on this step? Ask how to do it, what to buy, or snap a
              photo and ask “does this look right?”
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-blueprint px-3.5 py-2.5 text-sm text-white"
                  : "max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-paper px-3.5 py-2.5 text-sm text-ink"
              }
            >
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return m.role === "assistant" ? (
                    <div
                      key={i}
                      className="prose-reno space-y-2 leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_strong]:font-semibold"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {part.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                if (
                  part.type === "file" &&
                  part.mediaType?.startsWith("image/")
                ) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={part.url}
                      alt="attachment"
                      className="mt-2 max-h-56 rounded-lg border border-line"
                    />
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const tp = part as {
                    type: string;
                    state?: string;
                    output?: {
                      ok?: boolean;
                      message?: string;
                      options?: string[];
                    };
                  };
                  if (tp.state !== "output-available") return null;
                  // Quick-reply chips: accelerators only — the text box
                  // below is always available, so chips never gate.
                  if (
                    tp.type === "tool-ask" &&
                    tp.output?.options?.length
                  ) {
                    return (
                      <div key={i} className="mt-2 flex flex-wrap gap-2">
                        {tp.output.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            disabled={busy}
                            onClick={() => sendMessage({ text: o })}
                            className="rounded-full border border-line-strong px-3.5 py-2 text-sm text-ink transition-colors hover:border-ink hover:bg-paper-2 disabled:opacity-50"
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  const ok = tp.output?.ok !== false;
                  const label = TOOL_LABELS[tp.type] ?? "Updated task";
                  return (
                    <div
                      key={i}
                      className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase ${
                        ok
                          ? "border-positive/30 bg-positive-tint text-positive"
                          : "border-line-strong bg-paper text-ink-faint"
                      }`}
                    >
                      {ok ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : (
                        <X className="size-3" />
                      )}
                      {ok ? label : (tp.output?.message ?? "No change made")}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line bg-paper px-3.5 py-2.5">
              <Loader2 className="size-4 animate-spin text-ink-faint" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={a.url}
              className="relative size-14 overflow-hidden rounded-md border border-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt=""
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setAttachments((arr) => arr.filter((_, x) => x !== i))
                }
                className="absolute right-0 top-0 grid size-4 place-items-center bg-black/60 text-white"
                aria-label="Remove attachment"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
          aria-label="Attach photo"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </button>
        {voiceSupported && (
          <button
            type="button"
            onClick={recording ? stopVoice : startVoice}
            disabled={busy}
            className={
              recording
                ? "grid size-10 shrink-0 animate-pulse place-items-center rounded-lg border border-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10 text-danger"
                : "grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
            }
            aria-label={recording ? "Stop voice input" : "Start voice input"}
            aria-pressed={recording}
          >
            <Mic className="size-4" />
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={1}
          placeholder="Ask the Foreman…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-danger text-white"
            aria-label="Stop"
          >
            <Square className="size-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() && attachments.length === 0}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-blueprint text-white transition-colors hover:bg-blueprint-deep disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        )}
      </form>
    </section>
  );
}
