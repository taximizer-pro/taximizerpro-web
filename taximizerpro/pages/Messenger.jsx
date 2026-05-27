import { useState, useEffect, useRef } from "react";
import { Message, StaffMember, ClientMilestone } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useUser } from "@/hooks/useUser";

export default function Messenger() {
  const { data: user } = useUser();
  const [myStaff, setMyStaff]       = useState(null);
  const [threads, setThreads]       = useState([]);
  const [active, setActive]         = useState(null);
  const [messages, setMessages]     = useState([]);
  const [body, setBody]             = useState("");
  const [sending, setSending]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [contacts, setContacts]     = useState([]);
  const [showNew, setShowNew]       = useState(false);
  const [newTo, setNewTo]           = useState("");
  const [newSubj, setNewSubj]       = useState("");
  const bottomRef = useRef(null);

  const isAdmin = ["super_admin","admin","manager","agent"].includes(myStaff?.role);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const [sm, sent, recv] = await Promise.all([
        StaffMember.filter({ email: user.email }),
        Message.filter({ sender_email: user.email }),
        Message.filter({ recipient_email: user.email }),
      ]);
      setMyStaff(sm[0] || null);
      const role = sm[0]?.role;
      const isAdm = ["super_admin","admin","manager","agent"].includes(role);

      // Build thread list
      const all = [...sent, ...recv];
      const threadMap = {};
      all.forEach(m => {
        const tid = m.thread_id || m.id;
        if (!threadMap[tid]) threadMap[tid] = { id: tid, subject: m.subject, messages: [], other: "" };
        threadMap[tid].messages.push(m);
        if (m.sender_email !== user.email) threadMap[tid].other = m.sender_email;
        if (m.recipient_email !== user.email) threadMap[tid].other = m.recipient_email;
      });
      Object.values(threadMap).forEach(t => t.messages.sort((a,b)=>new Date(a.created_date)-new Date(b.created_date)));
      setThreads(Object.values(threadMap).sort((a,b)=>{
        const la = a.messages[a.messages.length-1]?.created_date;
        const lb = b.messages[b.messages.length-1]?.created_date;
        return new Date(lb)-new Date(la);
      }));

      // Contacts
      if (isAdm) {
        // Admins can message any client (from milestones) or staff
        const [ms, staff] = await Promise.all([ClientMilestone.list(), StaffMember.list()]);
        const clientEmails = [...new Set(ms.map(m => {
          try { return JSON.parse(m.notes||"{}").email; } catch { return null; }
        }).filter(Boolean))];
        const staffEmails = staff.map(s=>({ email: s.email, name: s.full_name||s.email, role: s.role }));
        setContacts([
          ...staffEmails,
          ...clientEmails.map(e=>({ email: e, name: e, role: "client" })),
        ]);
      } else {
        // Clients can only message admin
        setContacts([{ email: "taximizerpro@gmail.com", name: "TaximizerPro Support", role: "admin" }]);
      }

      setLoading(false);
    }
    load();
  }, [user]);

  useEffect(() => {
    if (!active) return;
    const t = threads.find(t=>t.id===active);
    if (t) {
      setMessages(t.messages);
      // Mark as read
      t.messages.filter(m=>m.recipient_email===user?.email && !m.read_by?.includes(user?.email)).forEach(m=>{
        Message.update(m.id, { read_by: [...(m.read_by||[]), user.email] }).catch(()=>{});
      });
    }
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  }, [active, threads]);

  async function send() {
    if (!body.trim() || !active) return;
    setSending(true);
    const t = threads.find(t=>t.id===active);
    const recipientEmail = t?.other;
    try {
      const msg = await Message.create({
        sender_email:    user.email,
        sender_name:     user.full_name || user.email,
        sender_role:     myStaff?.role || "client",
        recipient_email: recipientEmail,
        thread_id:       active,
        subject:         t?.subject || "Message",
        body:            body.trim(),
        channel:         "app",
        message_type:    "direct",
        read_by:         [user.email],
        status:          "sent",
      });
      setMessages(prev => [...prev, msg]);
      setThreads(prev => prev.map(th => th.id===active ? {...th, messages:[...th.messages,msg]} : th));
      setBody("");
    } catch(e) { console.error(e); }
    setSending(false);
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  }

  async function startNewThread() {
    if (!newTo || !newSubj.trim()) return;
    setSending(true);
    try {
      const tid = `thread_${Date.now()}`;
      const msg = await Message.create({
        sender_email:    user.email,
        sender_name:     user.full_name || user.email,
        sender_role:     myStaff?.role || "client",
        recipient_email: newTo,
        thread_id:       tid,
        subject:         newSubj.trim(),
        body:            body.trim() || "(New conversation)",
        channel:         "app",
        message_type:    "direct",
        read_by:         [user.email],
        status:          "sent",
      });
      const newThread = { id: tid, subject: newSubj.trim(), messages: [msg], other: newTo };
      setThreads(prev => [newThread, ...prev]);
      setActive(tid);
      setShowNew(false);
      setNewTo(""); setNewSubj(""); setBody("");
    } catch(e) { console.error(e); }
    setSending(false);
  }

  const unreadCount = threads.reduce((acc, t) =>
    acc + t.messages.filter(m => m.recipient_email===user?.email && !m.read_by?.includes(user?.email)).length, 0);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <img src="https://media.base44.com/images/public/6a14ef767988d1ef0baff5aa/883f43554_generated_image.png" alt="TaximizerPro" class="h-8 w-auto" />
            <span className="font-black text-sm text-slate-800">Messages</span>
            {unreadCount > 0 && <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">{unreadCount} new</span>}
          </div>
          <button onClick={()=>setShowNew(true)} className="bg-amber-400 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-sm">
            + New
          </button>
        </div>
      </nav>

      {/* New Thread Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800">New Message</h3>
              <button onClick={()=>setShowNew(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">To</label>
              <select value={newTo} onChange={e=>setNewTo(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-amber-400">
                <option value="">Select recipient...</option>
                {contacts.map(c => (
                  <option key={c.email} value={c.email}>{c.name} ({c.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Subject</label>
              <input value={newSubj} onChange={e=>setNewSubj(e.target.value)} placeholder="What's this about?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-amber-400"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Message</label>
              <textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} placeholder="Write your message..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-amber-400 resize-none"/>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setShowNew(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold transition-colors">Cancel</button>
              <button onClick={startNewThread} disabled={!newTo||!newSubj.trim()||sending}
                className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-500 text-white rounded-xl text-sm font-black transition-colors disabled:opacity-50 shadow-sm">
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Thread list */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto hidden sm:block">
          {threads.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No messages yet.<br/>Start a conversation!</div>
          ) : threads.map(t => {
            const last = t.messages[t.messages.length-1];
            const hasUnread = t.messages.some(m=>m.recipient_email===user?.email && !m.read_by?.includes(user?.email));
            return (
              <button key={t.id} onClick={()=>setActive(t.id)}
                className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${active===t.id ? "bg-amber-50 border-l-2 border-l-amber-400" : ""}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-sm font-semibold text-slate-800 truncate flex-1">{t.subject}</div>
                  {hasUnread && <div className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0 ml-2"/>}
                </div>
                <div className="text-xs text-slate-400 truncate">{t.other}</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">{last?.body?.slice(0,50)}</div>
              </button>
            );
          })}
        </div>

        {/* Message view */}
        <div className="flex-1 flex flex-col bg-slate-50">
          {!active ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
              <div className="text-4xl">💬</div>
              <div className="text-sm">Select a conversation or start a new one</div>
              <button onClick={()=>setShowNew(true)} className="mt-2 bg-amber-400 hover:bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors shadow-sm">
                + New Message
              </button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-slate-200 px-5 py-4">
                <div className="font-bold text-slate-800">{threads.find(t=>t.id===active)?.subject}</div>
                <div className="text-xs text-slate-400">{threads.find(t=>t.id===active)?.other}</div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => {
                  const mine = m.sender_email === user?.email;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-sm px-4 py-3 rounded-2xl text-sm shadow-sm ${
                        mine ? "bg-amber-400 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                      }`}>
                        {!mine && <div className="text-xs font-bold mb-1 opacity-60">{m.sender_name || m.sender_email}</div>}
                        <div className="leading-relaxed">{m.body}</div>
                        <div className={`text-xs mt-1.5 opacity-60 ${mine ? "text-right" : ""}`}>
                          {new Date(m.created_date).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef}/>
              </div>

              {/* Input */}
              <div className="bg-white border-t border-slate-200 p-4">
                <div className="flex gap-3">
                  <input
                    value={body} onChange={e=>setBody(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                  <button onClick={send} disabled={!body.trim()||sending}
                    className="bg-amber-400 hover:bg-amber-500 text-white rounded-xl px-4 py-2.5 font-bold text-sm transition-colors disabled:opacity-50 shadow-sm">
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
