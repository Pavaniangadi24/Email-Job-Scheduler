import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Activity, ArrowDownToLine, ArrowUpRight, CalendarClock, Check, ChevronDown, CircleHelp, Clock3, FileUp, Inbox, LogOut, Mail, Menu, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { api, googleLoginUrl, slackConnectUrl } from './lib/api';
import { extractRecipients } from './lib/recipients';
import type { EmailRecord, User } from './types';

type Tab = 'scheduled' | 'sent';
type Notice = { type: 'success' | 'error'; text: string };

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.me().then(({ user: currentUser }) => setUser(currentUser)).catch(() => setUser(null)).finally(() => setAuthLoading(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'failed') setNotice({ type: 'error', text: 'Google sign-in did not complete. Please try again.' });
    if (params.get('slack') === 'connected') setNotice({ type: 'success', text: 'Slack workspace connected.' });
    if (params.get('slack') === 'failed') setNotice({ type: 'error', text: 'Slack could not be connected.' });
    if (params.has('login') || params.has('slack')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    const loadEmails = async () => {
      setLoading(true);
      try {
        const response = isSearching && search.trim() ? await api.search(search) : await api.emails(tab);
        if (live) setEmails(response.emails);
      } catch (error) {
        if (live) setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not load email records.' });
      } finally { if (live) setLoading(false); }
    };
    void loadEmails();
    const timer = window.setInterval(() => void loadEmails(), 8000);
    return () => { live = false; window.clearInterval(timer); };
  }, [user, tab, isSearching, search]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!search.trim()) { setIsSearching(false); return; }
    setLoading(true);
    try { setEmails((await api.search(search)).emails); setIsSearching(true); }
    catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Search failed.' }); }
    finally { setLoading(false); }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  async function disconnectSlack() {
    try {
      await api.disconnectSlack();
      setUser({ ...user!, slackConnection: null });
      setMenuOpen(false);
      setNotice({ type: 'success', text: 'Slack workspace disconnected.' });
    } catch { setNotice({ type: 'error', text: 'Unable to disconnect Slack.' }); }
  }

  if (authLoading) return <div className="boot-screen"><div className="brand-mark"><Send size={17} /></div><span>Opening your outbox</span></div>;
  if (!user) return <Login notice={notice} />;

  const sentCount = emails.filter(email => email.status === 'SENT').length;
  const failedCount = emails.filter(email => email.status === 'FAILED').length;
  const scheduledCount = emails.filter(email => email.status === 'SCHEDULED' || email.status === 'PROCESSING').length;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Outbox home"><span className="brand-mark"><Send size={16} /></span><span>outbox<span className="brand-period">.</span></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <button className="workspace-switch"><span className="workspace-glyph">{user.name.charAt(0).toUpperCase()}</span><span className="workspace-copy"><strong>{user.name.split(' ')[0]}'s workspace</strong><small>Free plan</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">CAMPAIGNS</div>
      <nav className="main-nav" aria-label="Email views">
        <button className={`nav-item ${tab === 'scheduled' ? 'active' : ''}`} onClick={() => { setTab('scheduled'); setIsSearching(false); }}><CalendarClock size={17} /><span>Scheduled</span><span className="nav-count">{tab === 'scheduled' ? emails.length : ''}</span></button>
        <button className={`nav-item ${tab === 'sent' ? 'active' : ''}`} onClick={() => { setTab('sent'); setIsSearching(false); }}><Inbox size={17} /><span>Sent emails</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-pulse"><span className="pulse-dot" /><span>All systems operational</span><Activity size={14} /></div>
        <button className="nav-item utility-item" onClick={() => window.open(`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/admin/queues`, '_blank', 'noopener,noreferrer')}><SlidersHorizontal size={16} /><span>Queue monitor</span><ArrowUpRight size={13} /></button>
        <a className="nav-item utility-item" href="mailto:support@reachinbox.ai"><CircleHelp size={16} /><span>Help & support</span></a>
        <div className="profile-menu-wrap">
          {menuOpen && <div className="profile-menu"><div className="profile-menu-heading">Connected services</div>{user.slackConnection?.teamName ? <><span className="connected-label"><span className="connected-dot" />{user.slackConnection.teamName}</span><button onClick={disconnectSlack}>Disconnect Slack</button></> : <a href={slackConnectUrl}>Connect Slack for alerts <ArrowUpRight size={13} /></a>}<button onClick={logout}><LogOut size={14} /> Sign out</button></div>}
          <button className="profile" onClick={() => setMenuOpen(!menuOpen)}><img src={user.avatarUrl ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=dae5df&color=203d32`} alt="" /><span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span><MoreHorizontal size={17} /></button>
        </div>
      </div>
    </aside>

    <main className="main-content" id="top">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}</strong></div><div className="top-actions"><span className="date-chip"><span className="pulse-dot" /> Live workspace</span><button className="help-icon" aria-label="Help" title="Help & support" onClick={() => window.open('mailto:support@reachinbox.ai')}><CircleHelp size={17} /></button><button className="mobile-profile" onClick={() => void logout()} aria-label="Sign out"><LogOut size={17} /></button></div></header>
      <section className="page-content">
        <div className="page-heading-row"><div><div className="eyebrow"><span className="eyebrow-line" />OUTBOUND STUDIO</div><h1>{tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}<span className="title-period">.</span></h1><p className="page-subtitle">{tab === 'scheduled' ? 'A clear view of everything on its way.' : 'Every message, accounted for.'}</p></div><button className="primary-button" onClick={() => setComposeOpen(true)}><Plus size={17} strokeWidth={2.3} /> Compose email</button></div>

        <div className="metric-strip">
          <div className="metric"><span className="metric-icon scheduled-icon"><CalendarClock size={16} /></span><span className="metric-name">In queue</span><strong>{tab === 'scheduled' ? (loading && !emails.length ? '—' : scheduledCount) : '—'}</strong><small>waiting to send</small></div>
          <div className="metric-divider" />
          <div className="metric"><span className="metric-icon sent-icon"><Check size={16} /></span><span className="metric-name">Delivered</span><strong>{tab === 'sent' ? (loading && !emails.length ? '—' : sentCount) : '—'}</strong><small>successfully sent</small></div>
          <div className="metric-divider" />
          <div className="metric"><span className="metric-icon failed-icon"><X size={16} /></span><span className="metric-name">Needs attention</span><strong>{tab === 'sent' ? (loading && !emails.length ? '—' : failedCount) : '—'}</strong><small>delivery issues</small></div>
          <div className="metric-aside"><span className="metric-aside-mark"><ShieldCheck size={17} /></span><span><strong>Sending health</strong><small>Queue is running smoothly</small></span><span className="health-bars"><i /><i /><i /><i /><i /></span></div>
        </div>

        <section className="list-section">
          <div className="list-toolbar"><div className="view-tabs"><button className={tab === 'scheduled' ? 'selected' : ''} onClick={() => { setTab('scheduled'); setIsSearching(false); }}>Scheduled <span>{tab === 'scheduled' ? emails.length : ''}</span></button><button className={tab === 'sent' ? 'selected' : ''} onClick={() => { setTab('sent'); setIsSearching(false); }}>Sent</button></div><div className="table-actions"><form className="search-field" onSubmit={submitSearch}><Search size={15} /><input aria-label="Search emails" placeholder="Search emails" value={search} onChange={event => setSearch(event.target.value)} /><kbd>↵</kbd></form>{isSearching && <button className="clear-search" onClick={() => { setSearch(''); setIsSearching(false); }}>Clear</button>}<button className="filter-button" title="Filter options" onClick={() => setNotice({ type: 'success', text: 'Showing all email records.' })}><Settings2 size={16} /><span>Filters</span></button><button className="export-button" title="Export CSV" onClick={() => exportCsv(emails)}><ArrowDownToLine size={16} /><span>Export</span></button></div></div>
          <div className="table-wrap"><table><thead><tr><th className="recipient-heading">RECIPIENT</th><th>SUBJECT</th><th>{tab === 'scheduled' ? 'SCHEDULED FOR' : 'SENT AT'}</th><th>STATUS</th><th aria-label="Actions" /></tr></thead><tbody>
            {loading && !emails.length ? <tr><td colSpan={5}><div className="table-loading"><span className="spinner" />Fetching email activity</div></td></tr> : emails.length ? emails.map((email, index) => <tr key={email.id} className="email-row" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}><td><div className="recipient-cell"><span className={`recipient-avatar avatar-${index % 5}`}>{email.recipient.charAt(0).toUpperCase()}</span><span><strong>{email.recipient}</strong><small>via {email.sender}</small></span></div></td><td><span className="subject-cell">{email.subject}</span></td><td><span className="time-cell"><Clock3 size={14} />{formatDate(tab === 'scheduled' ? email.scheduledAt : email.sentAt ?? email.scheduledAt)}</span></td><td><Status status={email.status} /></td><td><button className="row-more" title="Email details" onClick={() => setNotice({ type: email.error ? 'error' : 'success', text: email.error ?? `Email ${email.id.slice(0, 8)} · ${email.recipient}` })}><MoreHorizontal size={17} /></button></td></tr>) : <tr><td colSpan={5}><div className="empty-state"><div className="empty-illustration"><Mail size={25} /><span><Sparkles size={13} /></span></div><strong>{isSearching ? 'No matching emails' : tab === 'scheduled' ? 'Your queue is clear' : 'No emails sent yet'}</strong><p>{isSearching ? 'Try a different recipient or subject.' : tab === 'scheduled' ? 'When you schedule a campaign, it will show up here.' : 'Sent email activity will appear here once your first campaign runs.'}</p>{tab === 'scheduled' && !isSearching && <button className="secondary-button" onClick={() => setComposeOpen(true)}><Plus size={15} /> Schedule your first email</button>}</div></td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>{emails.length ? `Showing ${emails.length} email${emails.length === 1 ? '' : 's'}` : '—'}{isSearching ? ' · Search results' : ''}</span><span className="updated-label"><span className="pulse-dot" /> Updates automatically</span></div>
        </section>
        <footer className="page-footer"><span>OUTBOX BY REACHINBOX</span><span>Thoughtful sending, at any scale.</span><a href="http://localhost:4000/admin/queues" target="_blank" rel="noreferrer">Queue status <ArrowUpRight size={12} /></a></footer>
      </section>
    </main>

    {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} onScheduled={message => { setComposeOpen(false); setTab('scheduled'); setIsSearching(false); setNotice({ type: 'success', text: message }); void api.emails('scheduled').then(result => setEmails(result.emails)); }} onError={message => setNotice({ type: 'error', text: message })} />}
    {notice && <div role="status" className={`toast ${notice.type}`}><span className="toast-icon">{notice.type === 'success' ? <Check size={16} /> : <X size={16} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}

function Login({ notice }: { notice: Notice | null }) {
  return <main className="login-page"><div className="login-texture" /><div className="login-side"><a className="brand login-brand" href="#top"><span className="brand-mark"><Send size={16} /></span><span>outbox<span className="brand-period">.</span></span></a><div className="login-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-envelope"><Send size={36} /></div><div className="floating-note note-one"><span className="note-dot" />Campaign queued <small>just now</small></div><div className="floating-note note-two"><Check size={14} />Delivery confirmed</div></div><div className="login-quote"><span>THE OUTBOUND STUDIO</span><h2>Make every<br />send feel <em>intentional.</em></h2><p>Thoughtful outreach, paced with care. All from one calm corner of your workspace.</p><div className="login-quote-foot"><span>01 / 03</span><span className="quote-lines"><i /><i /><i /></span></div></div></div><div className="login-panel"><div className="login-topline"><span>REACHINBOX / OUTBOX</span><span>YOUR WORKSPACE, IN MOTION</span></div><div className="login-form-wrap"><div className="login-kicker"><span />WELCOME BACK</div><h1>Your next send<br />starts <em>here.</em></h1><p className="login-intro">Sign in to keep your conversations moving.</p>{notice && <div className="login-alert">{notice.text}</div>}<a className="google-button" href={googleLoginUrl}><GoogleGlyph /><span>Continue with Google</span><ArrowUpRight size={15} /></a><div className="login-rule"><span>SECURE WORKSPACE ACCESS</span></div><div className="login-assurance"><ShieldCheck size={16} /><span>Your campaigns and contact data stay private.</span></div></div><div className="login-foot"><span>© 2026 OUTBOX STUDIO</span><span>BUILT FOR GOOD CONVERSATIONS</span></div></div></main>;
}

function GoogleGlyph() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.99 7.28-2.65l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.16v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.85 14.11a6.62 6.62 0 0 1 0-4.22V7.05H2.16a11 11 0 0 0 0 9.9l3.69-2.84Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.07 14.97 1 12 1a11 11 0 0 0-9.84 6.05l3.69 2.84C6.72 7.29 9.14 5.36 12 5.36Z"/></svg>; }

function Status({ status }: { status: EmailRecord['status'] }) {
  const details = { SCHEDULED: ['Queued', 'status-queued'], PROCESSING: ['Sending', 'status-sending'], SENT: ['Delivered', 'status-sent'], FAILED: ['Failed', 'status-failed'] } as const;
  const [label, style] = details[status];
  return <span className={`status-pill ${style}`}><i />{label}</span>;
}

function ComposeModal({ onClose, onScheduled, onError }: { onClose: () => void; onScheduled: (message: string) => void; onError: (message: string) => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [fileName, setFileName] = useState('');
  const [startAt, setStartAt] = useState(() => new Date(Date.now() + 10 * 60000).toISOString().slice(0, 16));
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const recipients = extractRecipients(recipientText);

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) { onError('Lead files must be smaller than 5 MB.'); return; }
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.csv')) {
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      setRecipientText(parsed.data.flat().join('\n'));
    } else setRecipientText(text);
  }

  async function schedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipients.length) { onError('Add a CSV or text file containing at least one email address.'); return; }
    setSubmitting(true);
    try {
      await api.schedule({ sender, subject, body, recipients, startAt: new Date(startAt).toISOString(), delayMs: delaySeconds * 1000, hourlyLimit }, idempotencyKey);
      onScheduled(`${recipients.length} email${recipients.length === 1 ? '' : 's'} added to the queue.`);
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not schedule this email batch.'); }
    finally { setSubmitting(false); }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title"><header className="modal-header"><div><span className="modal-kicker">NEW CAMPAIGN / 01</span><h2 id="compose-title">Compose an email<span className="title-period">.</span></h2><p>One thoughtful message, delivered on your terms.</p></div><button className="icon-button" onClick={onClose} aria-label="Close compose"><X size={19} /></button></header><form onSubmit={schedule}><div className="compose-fields"><label className="field-label">FROM ADDRESS<input required type="email" placeholder="you@yourdomain.com" value={sender} onChange={event => setSender(event.target.value)} /></label><label className="field-label">SUBJECT<input required maxLength={500} placeholder="A subject worth opening" value={subject} onChange={event => setSubject(event.target.value)} /></label><label className="field-label">MESSAGE<textarea required maxLength={100000} rows={5} placeholder="Write your message..." value={body} onChange={event => setBody(event.target.value)} /></label>
        <div className="field-label">RECIPIENTS<div className="upload-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]); }}><label htmlFor="lead-file" className="upload-button"><FileUp size={17} /><span>{fileName ? 'Replace file' : 'Choose a file'}</span><input id="lead-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={event => { void handleFile(event.target.files?.[0]); }} /></label><span className="upload-copy">{fileName || 'or drop a CSV / TXT file here'}</span><span className="recipient-count">{recipients.length} found</span></div><textarea className="recipient-preview" rows={2} aria-label="Imported recipients" placeholder="Detected email addresses appear here" value={recipientText} onChange={event => setRecipientText(event.target.value)} /></div>
      </div><div className="schedule-options"><div className="option-heading"><span>SENDING WINDOW</span><span>CONTROL THE PACE</span></div><label className="field-label">START TIME<input required type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} /></label><div className="option-grid"><label className="field-label">DELAY BETWEEN EMAILS<div className="input-with-unit"><input required type="number" min={2} max={3600} value={delaySeconds} onChange={event => setDelaySeconds(Number(event.target.value))} /><span>seconds</span></div><small>Minimum platform pacing is 2 seconds.</small></label><label className="field-label">HOURLY SENDER LIMIT<div className="input-with-unit"><input required type="number" min={1} max={100000} value={hourlyLimit} onChange={event => setHourlyLimit(Number(event.target.value))} /><span>emails / hr</span></div><small>Overflow rolls into the next available window.</small></label></div></div><footer className="modal-footer"><span><ShieldCheck size={15} />Safe scheduling · duplicate-resistant</span><div><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? <span className="spinner light" /> : <CalendarClock size={16} />}{submitting ? 'Scheduling...' : 'Schedule emails'}</button></div></footer></form></section></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function exportCsv(emails: EmailRecord[]) {
  const rows = [['recipient', 'sender', 'subject', 'scheduledAt', 'sentAt', 'status'], ...emails.map(email => [email.recipient, email.sender, email.subject, email.scheduledAt, email.sentAt ?? '', email.status])];
  const content = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  link.download = 'outbox-emails.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export default App;