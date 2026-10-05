import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bell,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, CloudSun,
  Download, FileJson, FlaskConical, Gauge, LogOut, Menu, MessageCircle,
  MoreHorizontal, Plus, Printer, Search, Settings, Sprout, Trash2, TrendingUp, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  getGetAdvisoryQueryKey, getGetChatHistoryQueryKey, getGetDashboardQueryKey, getGetFieldQueryKey,
  getHealthCheckQueryKey,
  getGetSettingsQueryKey, getListAdvisoriesQueryKey, getListFieldsQueryKey, getListSoilMetricsQueryKey,
  useAddSoilMetric, useCreateField, useDeleteField, useGenerateAdvisory, useGetAdvisory,
  useGetChatHistory, useGetDashboard, useGetField, useGetSettings, useHealthCheck,
  useListAdvisories, useListFields, useListSoilMetrics, useSendChatMessage, useUpdateField,
  useUpdateSettings,
  type AdvisoryInput, type AdvisoryReport, type FarmField, type FieldInput, type FieldUpdate,
  type SoilMetricInput,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#2d604a', colorForeground: '#223b32', colorMutedForeground: '#718078', colorDanger: '#b44a40',
    colorBackground: '#fffdf7', colorInput: '#fbfaf4', colorInputForeground: '#223b32', colorNeutral: '#d9d9cb',
    fontFamily: 'DM Sans', borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf7] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#223b32] font-semibold', headerSubtitle: 'text-[#718078]',
    socialButtonsBlockButtonText: 'text-[#223b32]', formFieldLabel: 'text-[#3b5448]',
    footerActionLink: 'text-[#2d604a]', footerActionText: 'text-[#718078]', dividerText: 'text-[#718078]',
    identityPreviewEditButton: 'text-[#2d604a]', formFieldSuccessText: 'text-[#2d604a]',
    alertText: 'text-[#8c3d36]', logoBox: 'mb-3', logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#d9d9cb] hover:bg-[#f5f3e8]',
    formButtonPrimary: 'bg-[#2d604a] hover:bg-[#244f3d] text-white shadow-none',
    formFieldInput: 'bg-[#fbfaf4] border-[#d9d9cb] text-[#223b32]',
    footerAction: 'border-t border-[#e4e1d5]', dividerLine: 'bg-[#e4e1d5]',
    alert: 'border-[#ead0c8] bg-[#fff5f1]', otpCodeFieldInput: 'bg-[#fbfaf4] border-[#d9d9cb]',
    formFieldRow: 'mb-4', main: 'gap-5',
  },
};

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <div className={`brand ${inverse ? 'brand-inverse' : ''}`}><span className="brand-mark"><Sprout size={19} strokeWidth={2.4}/></span><span>agri<span className="brand-smart">smart</span></span></div>;
}
function Button({ children, onClick, kind = 'primary', type = 'button', disabled = false, className = '', title }: { children: ReactNode; onClick?: () => void; kind?: string; type?: 'button'|'submit'; disabled?: boolean; className?: string; title?: string }) {
  return <button title={title} type={type} disabled={disabled} onClick={onClick} className={`button button-${kind} ${className}`} data-testid={`button-${String(children).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,28)}`}>{children}</button>;
}
function IconButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return <button aria-label={title} title={title} onClick={onClick} className="icon-button" data-testid={`button-${title.toLowerCase().replace(/\s/g,'-')}`}>{children}</button>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="serif">{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function LoadingState({ label = 'Loading your farm data' }: { label?: string }) {
  return <div className="loading-panel" role="status"><span className="loading-orbit"/><span>{label}</span><div className="skeleton-line"/><div className="skeleton-line short"/></div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="state-card"><div className="state-icon"><CircleHelp size={21}/></div><h3>We couldn’t reach your field data</h3><p>Your saved work is safe. Check your connection and try again.</p><Button kind="secondary" onClick={retry}>Try again</Button></div>;
}
function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Sprout size={24}/></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}
function Notice({ children, tone = 'success' }: { children: ReactNode; tone?: string }) {
  return <div className={`notice notice-${tone}`} role="status"><CheckCircle2 size={17}/>{children}</div>;
}
function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();
  const links = [
    { href: '/dashboard', label: 'Overview', icon: <BarChart3 size={18}/> },
    { href: '/fields', label: 'My fields', icon: <Sprout size={18}/> },
    { href: '/advisory/new', label: 'New advisory', icon: <FlaskConical size={18}/> },
    { href: '/chat', label: 'Agronomist', icon: <MessageCircle size={18}/> },
    { href: '/settings', label: 'Preferences', icon: <Settings size={18}/> },
  ];
  return <div className="app-layout">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/dashboard" className="sidebar-brand"><BrandMark inverse/></Link>
       <div className="farm-switch"><span className="farm-initial">F</span><span><b>My farm</b><small>Grower workspace</small></span><ChevronDown size={15}/></div>
      <div className="nav-caption">YOUR FARM</div>
      <nav>{links.map(item => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-link ${path === item.href || (item.href === '/fields' && path.startsWith('/fields/')) ? 'nav-active' : ''}`}>{item.icon}<span>{item.label}</span>{item.href === '/advisory/new' && <span className="nav-add">+</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="advisor-card"><span className="advisor-status"/><div><b>Your agronomist</b><small>Ready when you are</small></div><ArrowUpRight size={16}/></div>
        <div className="profile-row"><span className="avatar">{user?.firstName?.slice(0,1) || 'G'}</span><span className="profile-copy"><b>{user?.fullName || 'Grower'}</b><small>Farm account</small></span><button className="logout" title="Sign out" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={17}/></button></div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu"><Menu size={20}/></button><div className="crumb"><span>My farm</span><ChevronRight size={14}/><b>{links.find(i => i.href === path)?.label || (path.startsWith('/fields/') ? 'Field profile' : path.startsWith('/advisory/') ? 'Advisory report' : 'Workspace')}</b></div><div className="topbar-right"><span className="today-date">{new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date())}</span><span className="top-separator"/><span className="weather-chip"><CloudSun size={16}/> Field conditions</span></div></header>
      <main className="content">{children}</main>
      <footer className="app-footer"><span>AgriSmart <span className="footer-dot">/</span> Field notes for better growing</span><span>Make each acre count.</span></footer>
    </div>
  </div>;
}
function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="auth-loading"><BrandMark/><LoadingState label="Opening your workspace"/></div>;
  if (!isSignedIn) return <Redirect to="/"/>;
  return <AppShell>{children}</AppShell>;
}
function QueryCacheGuard() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const next = user?.id ?? null;
    if (prev.current !== undefined && prev.current !== next) client.clear();
    prev.current = next;
  }), [addListener, client]);
  return null;
}
function PublicHome() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard"/>;
  return <div className="landing">
    <header className="landing-nav"><Link href="/" className="landing-logo"><BrandMark/></Link><div className="landing-navlinks"><a href="#how">How it works</a><a href="#fieldwork">Fieldwork, made clearer</a></div><div className="landing-actions"><Link href="/sign-in" className="text-link">Sign in</Link><Link href="/sign-up" className="button button-primary">Join AgriSmart <ArrowRight size={16}/></Link></div></header>
    <section className="hero">
      <div className="hero-copy page-enter"><div className="hero-kicker"><span className="kicker-dot"/> A steadier way to grow</div><h1 className="serif">Good decisions<br/>start <em>beneath</em><br/>the surface.</h1><p>Soil readings, crop observations, and a practical agronomist’s perspective—together in one place, right when you need them.</p><div className="hero-actions"><Link href="/sign-up" className="button button-primary button-large">Start with your fields <ArrowRight size={17}/></Link><Link href="/sign-in" className="hero-secondary">I already have an account <ArrowUpRight size={15}/></Link></div><div className="hero-proof"><div className="proof-avatars"><span>J</span><span>M</span><span>A</span></div><span>Made for the people who know their land.</span></div></div>
      <div className="hero-art"><div className="hero-art-orbit orbit-one"/><div className="hero-art-orbit orbit-two"/><div className="hero-sun"/><div className="plot-lines"><i/><i/><i/><i/><i/><i/></div><div className="field-silhouette"><div className="furrow furrow-a"/><div className="furrow furrow-b"/><div className="furrow furrow-c"/><div className="furrow furrow-d"/><div className="furrow furrow-e"/></div><div className="floating-note note-soil"><span className="note-icon"><Activity size={15}/></span><span><b>Soil health</b><small>Strong foundation</small></span><strong>82</strong></div><div className="floating-note note-action"><span className="action-check"><Check size={14}/></span><span><b>Next best step</b><small>Top-dress after rain</small></span></div><div className="hero-art-caption"><span>01 / 03</span><span>Read the ground. Respond with confidence.</span></div></div>
    </section>
    <section className="landing-strip"><div><span className="strip-index">01</span><span>Understand the soil you’re growing in.</span></div><div><span className="strip-index">02</span><span>Know what matters at this crop stage.</span></div><div><span className="strip-index">03</span><span>Turn observations into a clear next move.</span></div></section>
    <section id="how" className="landing-story"><div className="story-aside"><span className="eyebrow">THE AGRONOMY, WITH YOU</span><span className="vertical-note">PRACTICAL BY DESIGN · 2025</span></div><div className="story-main"><h2 className="serif">Your farm is always telling you something.</h2><p>AgriSmart brings the signals together: soil tests, changing weather, crop stage, and what you’re seeing in the field. Then it helps you make sense of them—without making your work more complicated.</p><Link href="/sign-up" className="underlined-link">See what your fields can tell you <ArrowRight size={16}/></Link></div><div className="story-aside-right"><div className="soil-disc"><div className="disc-ring"/><div className="disc-ring"/><div className="disc-core"><Sprout size={30}/></div></div><span className="disc-label">A better read on every acre</span></div></section>
    <section id="fieldwork" className="landing-benefits"><div className="benefit-intro"><span className="eyebrow">A FIELD COMPANION, NOT ANOTHER DASHBOARD</span><h2 className="serif">Grounded in what<br/>you can do next.</h2></div><div className="benefits-list"><article><span className="benefit-number">01</span><div><h3>Keep the whole season in view.</h3><p>Each field keeps its soil history and advisory notes close, so today’s call makes more sense in context.</p></div><ArrowUpRight size={19}/></article><article><span className="benefit-number">02</span><div><h3>Recommendations with a reason.</h3><p>Get specific nutrient, irrigation, and risk guidance that connects back to the conditions you entered.</p></div><ArrowUpRight size={19}/></article><article><span className="benefit-number">03</span><div><h3>Ask the question in front of you.</h3><p>Bring a field into the conversation and talk through the details with your AI agronomist.</p></div><ArrowUpRight size={19}/></article></div></section>
    <section className="landing-cta"><div className="cta-line"><span>ONE FIELD AT A TIME</span><span>FIELD NOTES / 001</span></div><div className="cta-content"><div><h2 className="serif">Better growing<br/>starts with a good read.</h2><p>Bring your field into focus. AgriSmart will meet you there.</p></div><Link href="/sign-up" className="button button-wheat button-large">Create your farm workspace <ArrowRight size={17}/></Link></div><div className="cta-bottom"><BrandMark inverse/><span>Fieldwork deserves clear thinking.</span><span>© AgriSmart</span></div></section>
  </div>;
}
function StatCard({ label, value, detail, icon, tone = '' }: { label: string; value: ReactNode; detail: string; icon: ReactNode; tone?: string }) {
  return <div className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
}
function Dashboard() {
  const dash = useGetDashboard();
  const fields = useListFields();
  const advisories = useListAdvisories();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const [filter, setFilter] = useState('');
  const retry = () => { void dash.refetch(); void fields.refetch(); void advisories.refetch(); };
  if (dash.isLoading || fields.isLoading || advisories.isLoading) return <LoadingState/>;
  if (dash.isError || fields.isError || advisories.isError) return <ErrorState retry={retry}/>;
  const summary = dash.data;
  const fieldRows = (fields.data || []).filter(f => f.fieldName.toLowerCase().includes(filter.toLowerCase())).slice(0, 4);
  return <div className="page-enter">
     <PageHeading eyebrow="YOUR FARM AT A GLANCE" title="Morning, grower." description="Here’s where things stand across your fields today." action={<Link href="/advisory/new" className="button button-primary"><Plus size={16}/> New advisory</Link>}/>
    <div className="status-banner"><span className={`status-pulse ${health.isError ? 'status-off' : ''}`}/><span>{health.isError ? 'Connection to the farm service needs attention.' : 'Your farm is up to date.'}</span><span className="banner-divider"/><span>{summary?.healthAlerts ? `${summary.healthAlerts} field alerts need a look` : 'No urgent field alerts'}</span><Link href="/fields" className="banner-link">Review fields <ArrowRight size={14}/></Link></div>
    <div className="stats-grid">
      <StatCard label="Active fields" value={summary?.activeFields ?? 0} detail="Your growing ground" icon={<Sprout size={18}/>}/>
      <StatCard label="Total area" value={<>{Number(summary?.totalAreaAcres ?? 0).toLocaleString()}<small> ac</small></>} detail="Across all active fields" icon={<BarChart3 size={18}/>}/>
      <StatCard label="Average health" value={<>{summary?.averageHealthScore ?? '—'}<small>{summary?.averageHealthScore != null ? '/100' : ''}</small></>} detail="Latest field assessments" icon={<Gauge size={18}/>} tone="stat-highlight"/>
      <StatCard label="Needs a look" value={summary?.healthAlerts ?? 0} detail="Alerts across your farm" icon={<Bell size={18}/>}/>
    </div>
    <div className="dashboard-grid">
      <section className="panel fields-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR GROUND</span><h2 className="serif">Field overview</h2></div><Link href="/fields" className="small-link">All fields <ArrowRight size={14}/></Link></div>
        {fieldRows.length === 0 ? <EmptyState title={filter ? 'No fields match that search' : 'Start with a field'} body={filter ? 'Try another field name.' : 'Add your first field to keep its readings and advice together.'} action={!filter ? <Link href="/fields" className="button button-secondary"><Plus size={15}/> Add a field</Link> : undefined}/> :
        <><div className="field-search"><Search size={15}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a field" aria-label="Search fields" data-testid="input-search-fields"/></div>
        <div className="field-list">{fieldRows.map((field,index) => <Link href={`/fields/${field.id}`} key={field.id} className="field-row" data-testid={`field-row-${field.id}`}><span className={`field-monogram monogram-${index % 4}`}><Sprout size={17}/></span><span className="field-name"><b>{field.fieldName}</b><small>{field.location} <span>·</span> {field.currentCrop}</small></span><span className="field-area"><b>{field.areaAcres}</b><small>acres</small></span><ChevronRight className="field-chevron" size={17}/></Link>)}</div></>}
        <div className="panel-footnote"><span className="footnote-mark"/> Soil, crop, and history for each field in one place.</div>
      </section>
      <section className="panel advisory-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT THINKING</span><h2 className="serif">Advisory activity</h2></div><Link href="/advisory/new" className="round-add"><Plus size={17}/></Link></div>
        {advisories.data?.length ? <div className="activity-list">{advisories.data.slice(0,4).map(item => <Link href={`/advisory/${item.id}`} key={item.id} className="activity-row"><span className={`score-ring ${item.healthScore < 60 ? 'score-warn' : ''}`}>{item.healthScore}</span><span className="activity-copy"><b>{item.fieldName}</b><small>{item.currentCrop} <span>·</span> {item.cropStage}</small><em>{item.summary}</em></span><ChevronRight size={16}/></Link>)}</div> : <EmptyState title="No advice just yet" body="Create your first field advisory when you're ready." action={<Link href="/advisory/new" className="small-link">Create an advisory <ArrowRight size={14}/></Link>}/>}
        <div className="advisor-callout"><span className="callout-icon"><MessageCircle size={17}/></span><span><b>Have a field question?</b><small>Talk through it with your agronomist.</small></span><Link href="/chat" aria-label="Open agronomist chat"><ArrowRight size={17}/></Link></div>
      </section>
    </div>
  </div>;
}

const cropOptions = ['Rice','Wheat','Maize','Cotton','Sugarcane','Soybean','Tomato','Potato','Groundnut'];
function FieldDialog({ field, onClose, onSaved }: { field?: FarmField; onClose: () => void; onSaved: () => void }) {
  const create = useCreateField();
  const update = useUpdateField();
  const [error,setError] = useState('');
  const [values,setValues] = useState({ fieldName: field?.fieldName || '', location: field?.location || '', areaAcres: field?.areaAcres?.toString() || '', soilType: field?.soilType || '', currentCrop: field?.currentCrop || 'Maize' });
  const change = (key: string, value: string) => setValues(v => ({...v,[key]:value}));
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const payload: FieldInput = { ...values, areaAcres: Number(values.areaAcres), currentCrop: values.currentCrop as FieldInput['currentCrop'] };
    try {
      if (field) await update.mutateAsync({ id: field.id, data: payload as FieldUpdate }); else await create.mutateAsync({ data: payload });
      onSaved(); onClose();
    } catch { setError('Could not save this field. Please check the details and try again.'); }
  }
  const busy = create.isPending || update.isPending;
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)onClose();}}><form className="modal-card" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">{field ? 'FIELD DETAILS' : 'ADD TO YOUR FARM'}</span><h2 className="serif">{field ? 'Edit field' : 'New field'}</h2></div><IconButton title="Close dialog" onClick={onClose}><X size={18}/></IconButton></div><p className="modal-intro">Give this ground a home in your farm workspace.</p>
    <label className="form-label">Field name<input required maxLength={100} value={values.fieldName} onChange={e=>change('fieldName',e.target.value)} placeholder="e.g. North 40" data-testid="input-field-name"/></label>
    <label className="form-label">Location<input required maxLength={255} value={values.location} onChange={e=>change('location',e.target.value)} placeholder="Town, region" data-testid="input-field-location"/></label>
    <div className="form-columns"><label className="form-label">Area <span className="input-suffix"><input required type="number" min="0.01" step="0.01" value={values.areaAcres} onChange={e=>change('areaAcres',e.target.value)} placeholder="0.0" data-testid="input-field-area"/> acres</span></label><label className="form-label">Soil type<input required maxLength={50} value={values.soilType} onChange={e=>change('soilType',e.target.value)} placeholder="Silt loam" data-testid="input-field-soil"/></label></div>
    <label className="form-label">Current crop<select value={values.currentCrop} onChange={e=>change('currentCrop',e.target.value)} data-testid="select-field-crop">{cropOptions.map(c=><option key={c}>{c}</option>)}</select></label>
    {error && <div className="form-error">{error}</div>}<div className="modal-actions"><Button kind="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : field ? 'Save changes' : <><Plus size={16}/> Add field</>}</Button></div>
  </form></div>;
}
function FieldsPage() {
  const fields = useListFields();
  const client = useQueryClient();
  const [dialog,setDialog] = useState<{open:boolean;field?:FarmField}>({open:false});
  const [search,setSearch] = useState('');
  const [notice,setNotice] = useState('');
  const [deleting,setDeleting] = useState<string|null>(null);
  const del = useDeleteField();
  const items = (fields.data || []).filter(f => `${f.fieldName} ${f.location} ${f.currentCrop}`.toLowerCase().includes(search.toLowerCase()));
  const after = async () => { await client.invalidateQueries({queryKey:getListFieldsQueryKey()}); await client.invalidateQueries({queryKey:getGetDashboardQueryKey()}); setNotice('Field saved to your farm.'); setTimeout(()=>setNotice(''),3000); };
  async function remove(field: FarmField) {
    if (!window.confirm(`Remove “${field.fieldName}” and its associated history? This cannot be undone.`)) return;
    setDeleting(field.id);
    try { await del.mutateAsync({id:field.id}); await client.invalidateQueries({queryKey:getListFieldsQueryKey()}); await client.invalidateQueries({queryKey:getGetDashboardQueryKey()}); setNotice(`${field.fieldName} removed.`); }
    catch { setNotice('Could not remove this field. Try again.'); }
    finally { setDeleting(null); setTimeout(()=>setNotice(''),3200); }
  }
  return <div className="page-enter"><PageHeading eyebrow="THE LAND YOU LOOK AFTER" title="Your fields." description="Every field has its own story. Keep the details, readings, and decisions together." action={<Button onClick={()=>setDialog({open:true})}><Plus size={16}/> Add field</Button>}/>
    {notice && <Notice>{notice}</Notice>}
    <div className="fields-toolbar"><div className="toolbar-count"><span>{fields.data?.length ?? 0}</span> active fields</div><label className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fields or crops" data-testid="input-fields-search"/></label></div>
    {fields.isLoading ? <LoadingState label="Loading your fields"/> : fields.isError ? <ErrorState retry={()=>void fields.refetch()}/> : items.length === 0 ? <EmptyState title={search ? 'No matching fields' : 'A good season starts here'} body={search ? 'Try a different search, or clear the field name.' : 'Add a field to start a useful record of what is happening on your farm.'} action={!search && <Button onClick={()=>setDialog({open:true})}><Plus size={16}/> Add your first field</Button>}/> :
      <div className="fields-table-wrap"><div className="fields-table-head"><span>FIELD / LOCATION</span><span>AREA</span><span>SOIL TYPE</span><span>CURRENT CROP</span><span>UPDATED</span><span></span></div>{items.map((f,i)=><div className="fields-table-row" key={f.id} data-testid={`field-card-${f.id}`}><Link href={`/fields/${f.id}`} className="table-field"><span className={`field-monogram monogram-${i%4}`}><Sprout size={17}/></span><span><b>{f.fieldName}</b><small>{f.location}</small></span></Link><span className="table-area">{f.areaAcres} <small>ac</small></span><span className="table-soil">{f.soilType}</span><span><span className="crop-chip">{f.currentCrop}</span></span><span className="table-date">{new Date(f.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><div className="row-actions"><IconButton title={`Edit ${f.fieldName}`} onClick={()=>setDialog({open:true,field:f})}><MoreHorizontal size={18}/></IconButton><button className="delete-icon" title={`Remove ${f.fieldName}`} onClick={()=>void remove(f)} disabled={deleting===f.id}><Trash2 size={16}/></button></div></div>)}</div>}
    {dialog.open && <FieldDialog field={dialog.field} onClose={()=>setDialog({open:false})} onSaved={()=>void after()}/>}
  </div>;
}

function FieldProfile() {
  const { id = '' } = useParams<{id:string}>();
  const [,setLocation]=useLocation();
  const detail = useGetField(id, {query:{queryKey:getGetFieldQueryKey(id),enabled:!!id}});
  const readings = useListSoilMetrics(id,{query:{queryKey:getListSoilMetricsQueryKey(id),enabled:!!id}});
  const client=useQueryClient();
  const [edit,setEdit]=useState(false);
  const [showReading,setShowReading]=useState(false);
  const [notice,setNotice]=useState('');
  const [showRemove,setShowRemove]=useState(false);
  const [menu,setMenu]=useState(false);
  const [error,setError]=useState('');
  const del=useDeleteField();
   const data=detail.data;
   const field=data?.field;
  async function removeField() {
    if(!field)return;
    setError('');
    try { await del.mutateAsync({id}); await client.invalidateQueries({queryKey:getListFieldsQueryKey()}); await client.invalidateQueries({queryKey:getGetDashboardQueryKey()}); setLocation('/fields'); }
    catch { setError('Could not remove this field.'); }
  }
  if(detail.isLoading) return <LoadingState label="Opening field profile"/>;
   if(detail.isError || !data || !field) return <ErrorState retry={()=>void detail.refetch()}/>;
   const soil=data.latestSoilMetric;
  const values=[
    {label:'Nitrogen',key:'nitrogen',value:soil?.nitrogen,unit:soil?.unit},
    {label:'Phosphorus',key:'phosphorus',value:soil?.phosphorus,unit:soil?.unit},
    {label:'Potassium',key:'potassium',value:soil?.potassium,unit:soil?.unit},
    {label:'pH level',key:'phLevel',value:soil?.phLevel,unit:'pH'},
    {label:'Organic carbon',key:'organicCarbon',value:soil?.organicCarbon,unit:'%'},
  ];
  return <div className="page-enter"><div className="backline"><Link href="/fields"><ArrowLeft size={15}/> All fields</Link><span>/</span><span>{field.location}</span></div>
    <div className="profile-heading"><div className="profile-field-mark"><Sprout size={23}/></div><div className="profile-title"><div className="eyebrow">FIELD PROFILE · {field.soilType}</div><h1 className="serif">{field.fieldName}</h1><p>{field.location} <span>·</span> {field.areaAcres} acres <span>·</span> {field.currentCrop}</p></div><div className="profile-actions"><Link href={`/advisory/new?fieldId=${field.id}`} className="button button-primary"><FlaskConical size={16}/> Get an advisory</Link><div className="menu-anchor"><IconButton title="Field actions" onClick={()=>setMenu(!menu)}><MoreHorizontal size={19}/></IconButton>{menu&&<div className="action-menu"><button onClick={()=>{setEdit(true);setMenu(false)}}>Edit field details</button><button className="danger-menu" onClick={()=>{setShowRemove(true);setMenu(false)}}>Remove field</button></div>}</div></div></div>
    <div className="profile-overview"><div className="profile-overview-label"><span className="eyebrow">LAST SOIL TEST</span><b>{soil ? new Date(soil.testDate).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}) : 'No test recorded'}</b></div>{soil ? values.map((v,i)=><div className={`soil-value soil-value-${i}`} key={v.key}><span>{v.label}</span><b>{v.value == null ? '—' : v.value}<small> {v.unit}</small></b></div>) : <div className="no-soil">Add a soil reading to give recommendations a stronger foundation.</div>}</div>
    <div className="detail-columns"><section className="panel readings-panel"><div className="panel-heading"><div><span className="eyebrow">FIELD HISTORY</span><h2 className="serif">Soil readings</h2></div><Button kind="secondary" onClick={()=>setShowReading(true)}><Plus size={15}/> Record test</Button></div>
      {readings.isLoading ? <LoadingState label="Loading reading history"/> : readings.isError ? <ErrorState retry={()=>void readings.refetch()}/> : readings.data?.length ? <div className="reading-table"><div className="reading-head"><span>TEST DATE</span><span>N</span><span>P</span><span>K</span><span>pH</span><span>OC</span></div>{readings.data.map(r=><div className="reading-row" key={r.id}><span>{new Date(r.testDate).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><span>{r.nitrogen}</span><span>{r.phosphorus}</span><span>{r.potassium}</span><span>{r.phLevel}</span><span>{r.organicCarbon ?? '—'}%</span></div>)}</div> : <EmptyState title="No readings on record" body="Log the most recent lab results so your field history can begin." action={<Button kind="secondary" onClick={()=>setShowReading(true)}><Plus size={15}/> Add soil test</Button>}/>}
     </section><section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">FIELD NOTES</span><h2 className="serif">Recent advisories</h2></div></div>{data.recentAdvisories?.length ? <div className="activity-list">{data.recentAdvisories.map(a=><Link href={`/advisory/${a.id}`} key={a.id} className="activity-row"><span className={`score-ring ${a.healthScore<60?'score-warn':''}`}>{a.healthScore}</span><span className="activity-copy"><b>{a.cropStage}</b><small>{new Date(a.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small><em>{a.summary}</em></span><ChevronRight size={16}/></Link>)}</div> : <EmptyState title="No advice saved" body="An advisory will appear here after you create one for this field."/>}</section></div>
    {edit && <FieldDialog field={field} onClose={()=>setEdit(false)} onSaved={()=>{void detail.refetch();void readings.refetch();void client.invalidateQueries({queryKey:getListFieldsQueryKey()});void client.invalidateQueries({queryKey:getGetDashboardQueryKey()});}}/>}
    {showReading && <SoilDialog fieldId={id} onClose={()=>setShowReading(false)} onSaved={async()=>{await client.invalidateQueries({queryKey:getListSoilMetricsQueryKey(id)});await client.invalidateQueries({queryKey:getGetFieldQueryKey(id)});setNotice('Soil test added to field history.');setTimeout(()=>setNotice(''),2800);}}/>}
    {notice&&<div className="toast-note"><CheckCircle2 size={16}/>{notice}</div>}
    {showRemove&&<div className="modal-backdrop"><div className="confirm-card"><div className="modal-head"><span className="danger-symbol"><Trash2 size={18}/></span><IconButton title="Close dialog" onClick={()=>setShowRemove(false)}><X size={18}/></IconButton></div><h2 className="serif">Remove this field?</h2><p>Removing <b>{field.fieldName}</b> also removes its soil and advisory history. This cannot be undone.</p>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><Button kind="ghost" onClick={()=>setShowRemove(false)}>Keep field</Button><Button kind="danger" onClick={()=>void removeField()} disabled={del.isPending}>{del.isPending?'Removing…':'Remove field'}</Button></div></div></div>}
  </div>;
}
function SoilDialog({ fieldId,onClose,onSaved }: {fieldId:string;onClose:()=>void;onSaved:()=>void|Promise<void>}) {
  const add=useAddSoilMetric();
  const [err,setErr]=useState('');
  const [form,setForm]=useState({nitrogen:'',phosphorus:'',potassium:'',phLevel:'6.5',organicCarbon:'',unit:'kg/ha',testDate:new Date().toISOString().slice(0,10)});
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));
  async function submit(e:FormEvent){e.preventDefault();setErr('');const payload:SoilMetricInput={nitrogen:+form.nitrogen,phosphorus:+form.phosphorus,potassium:+form.potassium,phLevel:+form.phLevel,organicCarbon:form.organicCarbon?+form.organicCarbon:null,unit:form.unit as SoilMetricInput['unit'],testDate:form.testDate};try{await add.mutateAsync({id:fieldId,data:payload});await onSaved();onClose()}catch{setErr('Could not save this test. Please try again.')}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal-card modal-wide" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">FIELD RECORD</span><h2 className="serif">Record a soil test</h2></div><IconButton title="Close dialog" onClick={onClose}><X size={18}/></IconButton></div><p className="modal-intro">Enter the lab values as reported. They’ll stay with this field.</p><div className="soil-input-grid">{[['Nitrogen','nitrogen'],['Phosphorus','phosphorus'],['Potassium','potassium'],['pH level','phLevel'],['Organic carbon %','organicCarbon']].map(([label,key])=><label key={key} className="form-label">{label}<input required={key!=='organicCarbon'} type="number" min={key==='phLevel'?'3.5':'0'} max={key==='phLevel'?'10':undefined} step="0.01" value={form[key as keyof typeof form]} onChange={e=>set(key,e.target.value)} placeholder="—"/></label>)}</div><div className="form-columns"><label className="form-label">Reported unit<select value={form.unit} onChange={e=>set('unit',e.target.value)}><option value="kg/ha">kg/ha</option><option value="ppm">ppm</option></select></label><label className="form-label">Test date<input required type="date" value={form.testDate} onChange={e=>set('testDate',e.target.value)}/></label></div>{err&&<div className="form-error">{err}</div>}<div className="modal-actions"><Button kind="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={add.isPending}>{add.isPending?'Saving test…':'Save reading'}</Button></div></form></div>;
}

function AdvisoryNew() {
  const [,setLocation]=useLocation();
  const fields=useListFields();
  const queryField=new URLSearchParams(window.location.search).get('fieldId')||'';
  const [fieldId,setFieldId]=useState(queryField);
  const fieldQuery=useGetField(fieldId,{query:{queryKey:getGetFieldQueryKey(fieldId),enabled:!!fieldId}});
  const generate=useGenerateAdvisory();
  const [error,setError]=useState('');
  const [form,setForm]=useState({cropStage:'Vegetative',nitrogen:'',phosphorus:'',potassium:'',phLevel:'6.5',organicCarbon:'',unit:'kg/ha',temperatureC:'',humidityPercent:'',rainfallMm:'',windKph:'',notes:''});
  useEffect(()=>{if(fieldQuery.data?.latestSoilMetric){const s=fieldQuery.data.latestSoilMetric;setForm(f=>({...f,nitrogen:String(s.nitrogen),phosphorus:String(s.phosphorus),potassium:String(s.potassium),phLevel:String(s.phLevel),organicCarbon:s.organicCarbon==null?'':String(s.organicCarbon),unit:s.unit}))}},[fieldQuery.data]);
  const set=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
  async function submit(e:FormEvent){e.preventDefault();setError('');const input:AdvisoryInput={fieldId,cropStage:form.cropStage as AdvisoryInput['cropStage'],nitrogen:+form.nitrogen,phosphorus:+form.phosphorus,potassium:+form.potassium,phLevel:+form.phLevel,organicCarbon:form.organicCarbon?+form.organicCarbon:null,unit:form.unit as AdvisoryInput['unit'],notes:form.notes||undefined,weather:form.temperatureC||form.humidityPercent||form.rainfallMm||form.windKph?{temperatureC:form.temperatureC?+form.temperatureC:undefined,humidityPercent:form.humidityPercent?+form.humidityPercent:undefined,rainfallMm:form.rainfallMm?+form.rainfallMm:undefined,windKph:form.windKph?+form.windKph:undefined}:undefined};try{const report=await generate.mutateAsync({data:input});await queryClient.invalidateQueries({queryKey:getListAdvisoriesQueryKey()});await queryClient.invalidateQueries({queryKey:getGetDashboardQueryKey()});setLocation(`/advisory/${report.id}`)}catch{setError('The advisory could not be generated. Check the field and values, then try again.')}}
  return <div className="page-enter advisory-create"><div className="backline"><Link href="/dashboard"><ArrowLeft size={15}/> Overview</Link><span>/</span><span>New advisory</span></div><PageHeading eyebrow="A CLOSER LOOK AT YOUR CROP" title="Build an advisory." description="Add what you know. Your agronomist will connect the conditions to a practical next step."/>
     {fields.isLoading?<LoadingState label="Loading fields"/>:fields.isError?<ErrorState retry={()=>void fields.refetch()}/>:fields.data?.length===0?<EmptyState title="First, add a field" body="Advisories are grounded in a field’s crop and soil history." action={<Link href="/fields" className="button button-primary"><Plus size={16}/> Add a field</Link>}/>:<form className="advisory-form" onSubmit={submit}>
      <section className="panel form-section"><div className="section-index">01</div><div className="section-content"><span className="eyebrow">THE FIELD</span><h2 className="serif">Where are we looking?</h2><p>Start with the field and the crop’s current stage.</p><div className="form-columns"><label className="form-label">Field<select value={fieldId} onChange={e=>setFieldId(e.target.value)} required data-testid="select-advisory-field"><option value="">Choose a field</option>{fields.data?.map(f=><option value={f.id} key={f.id}>{f.fieldName} — {f.currentCrop}</option>)}</select></label><label className="form-label">Crop stage<select value={form.cropStage} onChange={e=>set('cropStage',e.target.value)}>{['Germination','Vegetative','Flowering','Fruiting','Maturity/Harvest'].map(s=><option key={s}>{s}</option>)}</select></label></div></div></section>
      <section className="panel form-section"><div className="section-index">02</div><div className="section-content"><span className="eyebrow">SOIL CONDITIONS</span><h2 className="serif">What’s underfoot?</h2><p>{fieldQuery.data?.latestSoilMetric ? 'Latest soil test values are pre-filled. Adjust if you have a newer reading.' : 'Enter your latest soil test. A current reading helps sharpen the recommendation.'}</p><div className="metric-input-grid">{[['Nitrogen','nitrogen'],['Phosphorus','phosphorus'],['Potassium','potassium'],['pH level','phLevel'],['Organic carbon %','organicCarbon']].map(([label,key])=><label className="form-label" key={key}>{label}<input required={key!=='organicCarbon'} type="number" min={key==='phLevel'?'3.5':'0'} step="0.01" value={form[key as keyof typeof form]} onChange={e=>set(key,e.target.value)} placeholder="Enter value"/></label>)}<label className="form-label">Unit<select value={form.unit} onChange={e=>set('unit',e.target.value)}><option value="kg/ha">kg/ha</option><option value="ppm">ppm</option></select></label></div></div></section>
      <section className="panel form-section"><div className="section-index">03</div><div className="section-content"><span className="eyebrow">FIELD CONDITIONS</span><h2 className="serif">Anything else in the picture?</h2><p>Optional weather and observations help your agronomist be more specific.</p><div className="weather-input-grid">{[['Temperature °C','temperatureC'],['Humidity %','humidityPercent'],['Rainfall mm','rainfallMm'],['Wind km/h','windKph']].map(([label,key])=><label className="form-label" key={key}>{label}<input type="number" step="0.1" value={form[key as keyof typeof form]} onChange={e=>set(key,e.target.value)} placeholder="Optional"/></label>)}</div><label className="form-label">Crop observations<textarea rows={4} maxLength={3000} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="What are you seeing? Leaf color, pest pressure, recent work, or anything that feels different…" data-testid="input-advisory-notes"/></label><div className="character-count">{form.notes.length} / 3000</div></div></section>
      {error&&<div className="form-error">{error}</div>}<div className="generate-row"><span><span className="secure-dot"/> Grounded in your field inputs and growing context.</span><Button type="submit" disabled={generate.isPending||!fieldId} className="button-large">{generate.isPending?<><span className="button-loading"/>Reading the field…</>:<>Generate advisory <ArrowRight size={17}/></>}</Button></div>
    </form>}
  </div>;
}

function AdvisoryReportPage() {
  const {id=''}=useParams<{id:string}>();
  const reportQuery=useGetAdvisory(id,{query:{queryKey:getGetAdvisoryQueryKey(id),enabled:!!id}});
  const report=reportQuery.data;
  const exportJson=()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`agrismart-advisory-${report.id}.json`;a.click();URL.revokeObjectURL(url)};
  if(reportQuery.isLoading)return <LoadingState label="Preparing your advisory"/>;
  if(reportQuery.isError||!report)return <ErrorState retry={()=>void reportQuery.refetch()}/>;
  return <div className="page-enter report-page"><div className="backline"><Link href="/dashboard"><ArrowLeft size={15}/> Overview</Link><span>/</span><Link href={`/fields/${report.fieldId}`}>{report.fieldName}</Link><span>/</span><span>Advisory</span></div>
    <div className="report-head"><div><span className="eyebrow">FIELD ADVISORY · {new Date(report.createdAt).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}</span><h1 className="serif">A clearer path forward.</h1><p>{report.fieldName} <span>·</span> {report.currentCrop} <span>·</span> {report.cropStage}</p></div><div className="report-buttons"><Button kind="secondary" onClick={exportJson}><FileJson size={16}/> Export JSON</Button><Button kind="primary" onClick={()=>window.print()}><Printer size={16}/> Print report</Button></div></div>
    <div className="report-summary"><div className="health-score-large"><div className="score-track"><svg viewBox="0 0 100 100"><circle className="score-bg" cx="50" cy="50" r="44"/><circle className="score-value" cx="50" cy="50" r="44" style={{strokeDashoffset:276-(276*report.healthScore/100)}}/></svg><span><b>{report.healthScore}</b><small> / 100</small></span></div><span className="eyebrow">FIELD HEALTH</span></div><div className="summary-copy"><span className="eyebrow">THE READ</span><h2 className="serif">What stands out</h2><p>{report.summary}</p><div className="summary-yield"><TrendingUp size={17}/><span><small>ESTIMATED YIELD IMPACT</small><b>{report.estimatedYieldImpact}</b></span></div></div></div>
    <div className="report-grid"><section className="panel report-section"><div className="report-section-head"><span className="report-section-icon"><Activity size={18}/></span><div><span className="eyebrow">01 · NUTRIENT STATUS</span><h2 className="serif">What the soil is asking for</h2></div></div>{report.nutrientDeficiencies?.length ? report.nutrientDeficiencies.map((d,i)=><div className="recommend-row" key={`${d.nutrient}-${i}`}><span className={`severity-tag severity-${d.severity.toLowerCase()}`}>{d.severity}</span><div><b>{d.nutrient}</b><p>{d.recommendation}</p></div></div>) : <p className="muted-copy">No notable nutrient deficiencies were identified.</p>}</section>
      <section className="panel report-section"><div className="report-section-head"><span className="report-section-icon wheat-icon"><Sprout size={18}/></span><div><span className="eyebrow">02 · APPLICATION PLAN</span><h2 className="serif">A measured response</h2></div></div>{report.fertilizerPlan?.length ? report.fertilizerPlan.map((f,i)=><div className="fertilizer-row" key={`${f.fertilizerName}-${i}`}><div className="fertilizer-top"><b>{f.fertilizerName}</b><span className="rate">{f.applicationRateKgPerAcre}<small> kg/ac</small></span></div><div className="fertilizer-meta"><span>{f.applicationMethod.replaceAll('_',' ')}</span><span>{f.timing}</span></div></div>) : <p className="muted-copy">No fertilizer applications recommended.</p>}</section>
      <section className="panel report-section"><div className="report-section-head"><span className="report-section-icon risk-icon"><Bell size={18}/></span><div><span className="eyebrow">03 · WATCH LIST</span><h2 className="serif">Risks to keep in view</h2></div></div>{report.pestDiseaseRisks?.length ? report.pestDiseaseRisks.map((risk,i)=><div className="risk-row" key={`${risk.threatName}-${i}`}><div className="risk-title"><b>{risk.threatName}</b><span className={`risk-level risk-${risk.riskLevel.toLowerCase()}`}>{risk.riskLevel} risk</span></div><p>{risk.preventativeAction}</p></div>) : <p className="muted-copy">No immediate pest or disease risks flagged.</p>}</section>
      <section className="panel report-section irrigation-section"><div className="report-section-head"><span className="report-section-icon water-icon"><CloudSun size={18}/></span><div><span className="eyebrow">04 · WATER & TIMING</span><h2 className="serif">Keep moisture in balance</h2></div></div><p className="irrigation-copy">{report.irrigationAdvice}</p></section></div>
    <div className="report-foot"><span>Advice is a field-specific guide. Use local agronomic judgment and product labels before application.</span><Button kind="secondary" onClick={()=>window.print()}><Download size={15}/> Save a copy</Button></div>
  </div>;
}

function ChatPage() {
  const fields=useListFields();
  const initial=new URLSearchParams(window.location.search).get('fieldId')||'';
  const [fieldId,setFieldId]=useState(initial);
  const params={fieldId:fieldId||null};
  const history=useGetChatHistory(params,{query:{queryKey:getGetChatHistoryQueryKey(params)}});
  const send=useSendChatMessage();
  const client=useQueryClient();
  const [text,setText]=useState('');
  const [sendError,setSendError]=useState('');
  const bottom=useRef<HTMLDivElement>(null);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[history.data,send.isPending]);
  async function submit(e:FormEvent){e.preventDefault();if(!text.trim())return;setSendError('');try{await send.mutateAsync({data:{fieldId:fieldId||null,content:text.trim()}});setText('');await client.invalidateQueries({queryKey:getGetChatHistoryQueryKey(params)})}catch{setSendError('Your message did not send. Please try again.')}}
  return <div className="chat-page page-enter"><PageHeading eyebrow="YOUR FIELD-SIDE THINKING PARTNER" title="Talk it through." description="Ask about a symptom, a soil result, or the next decision on your mind."/>
    <div className="chat-context"><span className="context-mark"><Sprout size={17}/></span><span><b>Conversation context</b><small>{fieldId ? `Focused on ${fields.data?.find(f=>f.id===fieldId)?.fieldName || 'selected field'}` : 'General farm questions'}</small></span><label className="context-select"><select value={fieldId} onChange={e=>setFieldId(e.target.value)} aria-label="Set chat field" data-testid="select-chat-field"><option value="">All fields</option>{fields.data?.map(f=><option key={f.id} value={f.id}>{f.fieldName} · {f.currentCrop}</option>)}</select><ChevronDown size={15}/></label></div>
    <section className="chat-card"><div className="chat-topline"><span className="advisor-avatar"><Sprout size={19}/></span><span><b>AgriSmart agronomist</b><small><span className="online-dot"/> Ready to help</small></span><span className="chat-context-note"><Activity size={14}/> Practical, field-aware guidance</span></div>
      <div className="chat-messages">{history.isLoading?<LoadingState label="Loading conversation"/>:history.isError?<ErrorState retry={()=>void history.refetch()}/>:history.data?.length ? history.data.map(m=><div className={`message-row ${m.role==='user'?'message-user':''}`} key={m.id}><div className="message-avatar">{m.role==='assistant'?<Sprout size={15}/>:<span>Y</span>}</div><div className="message-body"><div className="message-meta">{m.role==='assistant'?'AgriSmart agronomist':'You'} <span>{new Date(m.createdAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span></div><div className="message-bubble">{m.content}</div></div></div>) : <div className="chat-welcome"><div className="welcome-mark"><Sprout size={24}/></div><span className="eyebrow">A GOOD PLACE TO START</span><h2 className="serif">What are you noticing?</h2><p>Share a symptom, soil result, or decision you’re weighing. A field-specific question is even better.</p><div className="prompt-chips">{['Why might leaves be yellowing?','What should I watch before flowering?','Help me interpret my latest soil test'].map(q=><button key={q} onClick={()=>setText(q)}>{q}<ArrowUpRight size={13}/></button>)}</div></div>}<div ref={bottom}/>{send.isPending&&<div className="thinking-row"><span className="typing-dots"><i/><i/><i/></span><span>Thinking through the field…</span></div>}</div>
      <form className="chat-composer" onSubmit={submit}><textarea rows={2} value={text} onChange={e=>setText(e.target.value)} placeholder="Ask about what’s happening in your field…" maxLength={4000} data-testid="input-chat-message"/><div className="composer-bottom"><span>{sendError||'Your messages stay with your farm workspace.'}</span><button className="send-button" type="submit" disabled={!text.trim()||send.isPending} aria-label="Send message"><ArrowRight size={18}/></button></div></form>
    </section>
  </div>;
}

function SettingsPage() {
  const settings=useGetSettings();
  const update=useUpdateSettings();
  const client=useQueryClient();
  const [units,setUnits]=useState('metric');
  const [region,setRegion]=useState('');
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{if(settings.data){setUnits(settings.data.units);setRegion(settings.data.region||'')}},[settings.data]);
  async function submit(e:FormEvent){e.preventDefault();setSaved(false);setError('');try{await update.mutateAsync({data:{units:units as 'metric'|'imperial',region:region||null}});await client.invalidateQueries({queryKey:getGetSettingsQueryKey()});setSaved(true);setTimeout(()=>setSaved(false),3000)}catch{setError('Preferences were not saved. Please try again.')}}
  return <div className="page-enter"><PageHeading eyebrow="MAKE IT YOURS" title="Farm preferences." description="A few details help AgriSmart speak the same language as your operation."/>
    {settings.isLoading?<LoadingState label="Loading preferences"/>:settings.isError?<ErrorState retry={()=>void settings.refetch()}/>:<form className="settings-wrap" onSubmit={submit}><section className="panel settings-panel"><div className="settings-section-head"><span className="settings-icon"><BarChart3 size={18}/></span><div><h2>Measurement units</h2><p>Choose how you prefer to see area and field readings.</p></div></div><div className="unit-choices"><label className={`unit-option ${units==='metric'?'unit-selected':''}`}><input type="radio" name="units" value="metric" checked={units==='metric'} onChange={()=>setUnits('metric')}/><span className="radio-mark"/><span><b>Metric</b><small>Hectares, kilograms, °C</small></span><span className="unit-symbol">ha</span></label><label className={`unit-option ${units==='imperial'?'unit-selected':''}`}><input type="radio" name="units" value="imperial" checked={units==='imperial'} onChange={()=>setUnits('imperial')}/><span className="radio-mark"/><span><b>Imperial</b><small>Acres, pounds, °F</small></span><span className="unit-symbol">ac</span></label></div></section>
      <section className="panel settings-panel"><div className="settings-section-head"><span className="settings-icon"><CloudSun size={18}/></span><div><h2>Region</h2><p>Keep regional references close to home.</p></div></div><label className="form-label settings-region">Region or growing area<input maxLength={100} value={region} onChange={e=>setRegion(e.target.value)} placeholder="e.g. Central Valley, California" data-testid="input-settings-region"/></label></section>
      {saved&&<Notice>Preferences saved.</Notice>}{error&&<div className="form-error">{error}</div>}<div className="settings-save"><span>Preferences apply to your farm account.</span><Button type="submit" disabled={update.isPending}>{update.isPending?'Saving…':<><Check size={16}/> Save preferences</>}</Button></div></form>}
  </div>;
}
function HomeRedirect() {
  const {isLoaded,isSignedIn}=useAuth();
  if(!isLoaded)return <div className="auth-loading"><BrandMark/><LoadingState label="Preparing AgriSmart"/></div>;
  return isSignedIn?<Redirect to="/dashboard"/>:<PublicHome/>;
}
function SignInPage() {
  return <div className="auth-page"><div className="auth-backdrop"><div className="auth-art-lines"/><span className="auth-stamp">A FIELD COMPANION<br/>FOR WHAT COMES NEXT</span></div><div className="auth-panel"><Link href="/" className="auth-logo"><BrandMark/></Link><div className="auth-context"><span className="eyebrow">WELCOME BACK</span><h1 className="serif">Your fields are<br/>right where you left them.</h1><p>Sign in to pick up where the season left off.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/><div className="auth-footnote">Practical growing advice, grounded in your land.</div></div></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-backdrop"><div className="auth-art-lines"/><span className="auth-stamp">START WITH THE GROUND<br/>BUILD FROM THERE</span></div><div className="auth-panel"><Link href="/" className="auth-logo"><BrandMark/></Link><div className="auth-context"><span className="eyebrow">MAKE ROOM FOR BETTER DECISIONS</span><h1 className="serif">Let’s get your<br/>farm in focus.</h1><p>A little context now makes every next step more useful.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/><div className="auth-footnote">Good decisions start beneath the surface.</div></div></div>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function ClerkRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to access your farm workspace'}},signUp:{start:{title:'Start your farm workspace',subtitle:'A clearer read on every acre begins here'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><QueryCacheGuard/><RoutedErrorBoundary><Switch>
      <Route path="/" component={HomeRedirect}/>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard">{()=><Protected><Dashboard/></Protected>}</Route>
      <Route path="/fields">{()=><Protected><FieldsPage/></Protected>}</Route>
      <Route path="/fields/:id">{()=><Protected><FieldProfile/></Protected>}</Route>
      <Route path="/advisory/new">{()=><Protected><AdvisoryNew/></Protected>}</Route>
      <Route path="/advisory/:id">{()=><Protected><AdvisoryReportPage/></Protected>}</Route>
      <Route path="/chat">{()=><Protected><ChatPage/></Protected>}</Route>
      <Route path="/settings">{()=><Protected><SettingsPage/></Protected>}</Route>
      <Route component={NotFound}/>
    </Switch></RoutedErrorBoundary><Toaster/></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkRoutes/></WouterRouter></TooltipProvider>;
}
export default App;
