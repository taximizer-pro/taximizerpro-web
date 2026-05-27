import { useState, useEffect, useRef } from "react";
import { Message, StaffMember } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

function Avatar({ name, color, online }) {
  const initials = (name || "?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{background: color || "#374151"}}>
        {initials}
      </div>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#080F1E] ${online ? "bg-emerald-400" : "bg-slate-600"}`}/>
      )}
    </div>
  );
}

export default function Messenger() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff] = useState(null);
  const [staff, setStaff] = useState([]);
  const [threads, setThreads] = useState({});
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [newMsg, setNewMsg] = useState(false);
  const [newTo, setNewTo] = useState("");
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    load();
    pollRef.current = setInterval(load, 10000);
    return () => clearInterval(pollRef.current);
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function load() {
    if (!user) return;
    try {
      const [sm, allStaff, sent, received] = await Promise.all([
        StaffMember.filter({ email: user.email }),
        StaffMember.list(),
        Message.filter({ sender_email: user.email }),
        Message.filter({ recipient_email: user.email }),
      ]);
      setMyStaff(sm[0] || null);
      setStaff(allStaff.filter(s => s.email !== user.email));

      // Build threads
      const allMsgs = [...sent, ...received];
      const threadMap = {};
      allMsgs.forEach(m => {
        const tid = m.thread_id || m.id;
        if (!threadMap[tid]) threadMap[tid] = { id: tid, msgs: [], subject: m.subject, other: m.sender_email === user.email ? m.recipient_email : m.sender_email };
        if (!threadMap[tid].msgs.find(x=>x.id===m.id)) threadMap[tid].msgs.push(m);
      });
      Object.values(threadMap).forEach(t => t.msgs.sort((a,b) => new Date(a.created_date)-new Date(b.created_date)));
      setThreads(threadMap);

      if (activeThread && threadMap[activeThread]) {
        setMessages(threadMap[activeThread].msgs);
        // Mark as read
        threadMap[activeThread].msgs.filter(m => m.recipient_email === user.email && !m.read_by?.includes(user.email)).forEach(m => {
          Message.update(m.id, { read_by: [...(m.read_by||[]), user.email] }).catch(()=>{});
        });
      }
    } catch(e) { console.error(e); }
  }

  function openThread(tid) {
    setActiveThread(tid);
    const t = threads[tid];
    if (t) {
      setMessages(t.msgs);
      t.msgs.filter(m => m.recipient_email === user?.email && !m.read_by?.includes(user?.email)).forEach(m => {
        Message.update(m.id, { read_by: [...(m.read_by||[]), user.email] }).catch(()=>{});
      });
    }
  }

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const tid = activeThread || `thread_${Date.now()}`;
      const recipientEmail = newMsg ? newTo : threads[activeThread]?.other;
      const recipient = staff.find(s => s.email === recipientEmail);
      const me = myStaff;

      await Message.create({
        sender_email: user.email,
        sender_name: me?.full_name || user.email,
        sender_role: me?.role || "staff",
        recipient_email: recipientEmail,
        recipient_name: recipient?.full_name || recipientEmail,
        subject: subject || threads[activeThread]?.subject || "Message",
        body: input.trim(),
        thread_id: tid,
        channel: "internal",
        message_type: "direct",
        read_by: [user.email],
        status: "delivered",
      });
      setInput("");
      setNewMsg(false);
      setActiveThread(tid);
      await load();
    } catch(e) { console.error(e); }
    setSending(false);
  }

  const threadList = Object.values(threads).sort((a,b) => {
    const la = a.msgs[a.msgs.length-1];
    const lb = b.msgs[b.msgs.length-1];
    return new Date(lb?.created_date||0) - new Date(la?.created_date||0);
  });

  const unreadCount = (tid) => threads[tid]?.msgs.filter(m => m.recipient_email === user?.email && !m.read_by?.includes(user?.email)).length || 0;

  return (
    <div className="min-h-screen bg-[#080F1E] text-white flex flex-col" style={{height:'100vh'}}>
      <nav className="flex-shrink-0 bg-[#080F1E]/95 backdrop-blur border-b border-white/5 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[#080F1E] font-black text-xs">T</div>
            <span className="font-black text-base">Messages</span>
          </div>
          <button onClick={() => { setNewMsg(true); setActiveThread(null); setMessages([]); setSubject(""); }}
            className="bg-amber-400 hover:bg-amber-300 text-[#080F1E] font-bold px-3 py-2 rounded-xl text-sm transition-colors">
            + New
          </button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 gap-4">
        {/* Thread list */}
        <div className="w-72 flex-shrink-0 bg-[#0D1628] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {threadList.length === 0 ? (
              <div className="py-8 text-center text-slate-600 text-sm">No messages yet</div>
            ) : threadList.map(t => {
              const last = t.msgs[t.msgs.length-1];
              const unread = unreadCount(t.id);
              const otherStaff = staff.find(s => s.email === t.other);
              return (
                <button key={t.id} onClick={() => openThread(t.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-white/5 transition-colors hover:bg-white/5 ${activeThread === t.id ? "bg-amber-400/5 border-l-2 border-l-amber-400" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={otherStaff?.full_name || t.other} color={otherStaff?.avatar_color} online={otherStaff?.is_online} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white truncate">{otherStaff?.full_name || t.other}</span>
                        {unread > 0 && <span className="w-5 h-5 bg-amber-400 rounded-full text-[10px] font-bold text-[#080F1E] flex items-center justify-center flex-shrink-0">{unread}</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{last?.body}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-[#0D1628] border border-white/5 rounded-2xl flex flex-col overflow-hidden">
          {!activeThread && !newMsg ? (
            <div className="flex-1 flex items-center justify-center text-slate-600">
              <div className="text-center space-y-2">
                <div className="text-4xl">💬</div>
                <div className="text-sm">Select a conversation or start a new one</div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/5 flex-shrink-0">
                {newMsg ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-white">New Message</div>
                    <select value={newTo} onChange={e=>setNewTo(e.target.value)}
                      className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50">
                      <option value="">Select recipient...</option>
                      {staff.map(s => <option key={s.email} value={s.email}>{s.full_name || s.email}</option>)}
                    </select>
                    <input type="text" placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)}
                      className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50"/>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {(() => { const s = staff.find(x => x.email === threads[activeThread]?.other); return <Avatar name={s?.full_name || threads[activeThread]?.other} color={s?.avatar_color} online={s?.is_online} />; })()}
                    <div>
                      <div className="font-semibold text-white text-sm">{staff.find(s=>s.email===threads[activeThread]?.other)?.full_name || threads[activeThread]?.other}</div>
                      <div className="text-xs text-slate-500">{threads[activeThread]?.subject}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.map(m => {
                  const isMine = m.sender_email === user?.email;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5 text-sm ${isMine ? "bg-amber-400 text-[#080F1E] font-medium rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm"}`}>
                        {m.body}
                        <div className={`text-[10px] mt-1 ${isMine ? "text-amber-700" : "text-slate-500"}`}>
                          {new Date(m.created_date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef}/>
              </div>

              {/* Input */}
              <div className="px-5 py-4 border-t border-white/5 flex-shrink-0">
                <div className="flex gap-3">
                  <input type="text" placeholder="Type a message..." value={input} onChange={e=>setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                    className="flex-1 bg-[#0A1628] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50"/>
                  <button onClick={send} disabled={!input.trim() || sending || (newMsg && !newTo)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${input.trim() && !sending && (!newMsg || newTo) ? "bg-amber-400 hover:bg-amber-300 text-[#080F1E]" : "bg-white/10 text-slate-500 cursor-not-allowed"}`}>
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
