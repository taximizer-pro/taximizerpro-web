import { useState, useEffect, useRef } from "react";
import { Message } from "@/api/entities";
import { useCurrentUser } from "@/api/users";

export default function Messenger() {
  const currentUser = useCurrentUser();
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [compose, setCompose] = useState(false);
  const [newMsg, setNewMsg] = useState({ to: "", subject: "", body: "" });
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => { loadMessages(); }, []);
  useEffect(() => {
    if (selectedThread) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedThread, messages]);

  async function loadMessages() {
    try {
      const all = await Message.list();
      setMessages(all);
      // Group by thread_id
      const tMap = {};
      all.forEach(m => {
        const tid = m.thread_id || m.id;
        if (!tMap[tid]) tMap[tid] = [];
        tMap[tid].push(m);
      });
      const tArr = Object.entries(tMap).map(([tid, msgs]) => ({
        id: tid,
        subject: msgs[0]?.subject || "No subject",
        messages: msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)),
        lastMsg: msgs[msgs.length - 1],
        unread: msgs.some(m => !m.read_by?.includes(currentUser?.email)),
      }));
      tArr.sort((a, b) => new Date(b.lastMsg?.created_date) - new Date(a.lastMsg?.created_date));
      setThreads(tArr);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function sendMessage() {
    if (!newMsg.to || !newMsg.body) return;
    setSending(true);
    try {
      const tid = `thread_${Date.now()}`;
      await Message.create({
        sender_email: currentUser?.email || "taximizerpro@gmail.com",
        sender_name: currentUser?.full_name || "Italy",
        sender_role: "admin",
        recipient_email: newMsg.to,
        subject: newMsg.subject || "(no subject)",
        body: newMsg.body,
        thread_id: tid,
        channel: "app",
        message_type: "outbound",
        status: "sent",
        read_by: [currentUser?.email],
      });
      setNewMsg({ to: "", subject: "", body: "" });
      setCompose(false);
      loadMessages();
    } catch (e) { console.error(e); }
    setSending(false);
  }

  async function sendReply() {
    if (!reply.trim() || !selectedThread) return;
    setSending(true);
    const thread = threads.find(t => t.id === selectedThread);
    const lastMsg = thread?.lastMsg;
    try {
      await Message.create({
        sender_email: currentUser?.email || "taximizerpro@gmail.com",
        sender_name: currentUser?.full_name || "Italy",
        sender_role: "admin",
        recipient_email: lastMsg?.sender_email !== currentUser?.email ? lastMsg?.sender_email : lastMsg?.recipient_email,
        subject: "Re: " + (lastMsg?.subject || ""),
        body: reply,
        thread_id: selectedThread,
        channel: "app",
        message_type: "outbound",
        status: "sent",
        read_by: [currentUser?.email],
        reply_to: lastMsg?.id,
      });
      setReply("");
      loadMessages();
    } catch (e) { console.error(e); }
    setSending(false);
  }

  const selectedThreadData = threads.find(t => t.id === selectedThread);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Messages</h1>
          <p className="text-xs text-slate-500">{threads.length} conversations</p>
        </div>
        <button onClick={() => setCompose(true)}
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          + New Message
        </button>
      </div>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 py-6 gap-4 h-[calc(100vh-70px)]">
        {/* Thread List */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Inbox</p>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {threads.map(t => (
              <button key={t.id} onClick={() => setSelectedThread(t.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${selectedThread === t.id ? "bg-blue-50 border-r-2 border-blue-600" : ""}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <p className={`text-sm truncate ${t.unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    {t.lastMsg?.sender_email === (currentUser?.email || "taximizerpro@gmail.com") ? t.lastMsg?.recipient_email : t.lastMsg?.sender_email}
                  </p>
                  {t.unread && <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0"></div>}
                </div>
                <p className="text-xs text-slate-500 truncate">{t.subject}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{t.lastMsg?.body}</p>
              </button>
            ))}
            {threads.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No messages yet</div>
            )}
          </div>
        </div>

        {/* Message View */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {selectedThreadData ? (
            <>
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-900 text-sm">{selectedThreadData.subject}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedThreadData.messages.map(m => {
                  const isMe = m.sender_email === (currentUser?.email || "taximizerpro@gmail.com");
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${isMe ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                        {!isMe && <p className="text-xs font-medium mb-1 opacity-70">{m.sender_name || m.sender_email}</p>}
                        <p>{m.body}</p>
                        <p className={`text-xs mt-1 opacity-60`}>
                          {new Date(m.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                <textarea
                  rows={2}
                  placeholder="Type a reply..."
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-40 self-end">
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-sm">Select a conversation to read</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {compose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">New Message</h2>
            <div>
              <label className="text-xs font-medium text-slate-600">To</label>
              <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newMsg.to} onChange={e => setNewMsg(p => ({...p, to: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Subject</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newMsg.subject} onChange={e => setNewMsg(p => ({...p, subject: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Message</label>
              <textarea rows={4} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newMsg.body} onChange={e => setNewMsg(p => ({...p, body: e.target.value}))} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCompose(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
              <button onClick={sendMessage} disabled={sending}
                className="bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-40">
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
