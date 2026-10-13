import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertCircle, BarChart3, BriefcaseBusiness, CalendarDays,
  CheckCircle2, ChevronRight, CloudUpload, Database, Download, FileSpreadsheet,
  Globe2, LoaderCircle, RefreshCw, ShieldCheck, TrendingUp, Users
} from 'lucide-react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar
} from 'recharts'
import { getHealth, getSummary, uploadDataset, getCleanedCsvUrl } from './api'

const fmt = value => `${Number(value).toFixed(2)}%`

function StatCard({ icon: Icon, label, value, note }) {
  return <article className="stat-card">
    <div className="stat-top"><span className="stat-icon"><Icon size={19} /></span><span className="stat-label">{label}</span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-note">{note}</div>
  </article>
}

function Panel({ title, subtitle, children, className = '' }) {
  return <section className={`panel ${className}`}>
    <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
    {children}
  </section>
}

export default function App() {
  const [summary, setSummary] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [file, setFile] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [h, s] = await Promise.all([getHealth(), getSummary()])
      setHealth(h)
      setSummary(s)
    } catch (e) {
      setError(e.message || 'Unable to load data. Check that the Python server is running.')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleUpload(event) {
    event.preventDefault()
    if (!file) {
      setError('Choose a CSV file first.')
      return
    }
    setUploading(true)
    setError('')
    setNotice('')
    try {
      const result = await uploadDataset(file)
      setNotice(`${result.message} ${result.rows.toLocaleString()} valid rows across ${result.regions} regions.`)
      setFile(null)
      event.target.reset()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const monthly = summary?.monthly_trend?.map(item => ({
    ...item,
    label: new Date(`${item.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  })) || []

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top"><span className="brand-mark"><Activity size={22} /></span><span>Labor<span className="brand-light">Lens</span><small>DATA INTELLIGENCE</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <a className="nav-link active" href="#overview"><BarChart3 size={18} /> Overview</a>
      <a className="nav-link" href="#trends"><TrendingUp size={18} /> Trend analysis</a>
      <a className="nav-link" href="#regions"><Globe2 size={18} /> Regional insights</a>
      <a className="nav-link" href="#dataset"><Database size={18} /> Dataset</a>
      <div className="sidebar-bottom"><span className="status-dot" /> Python analytics API <small>{health?.status === 'ok' ? 'Connected' : 'Checking connection'}</small></div>
    </aside>

    <main className="main-content" id="top">
      <header className="topbar">
        <div className="breadcrumb">Research <ChevronRight size={14} /> <strong>Unemployment analysis</strong></div>
        <button className="button button-quiet" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh data</button>
      </header>

      <section className="hero" id="overview">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> ECONOMIC RESEARCH DASHBOARD</div>
          <h1>Understanding the<br /><span>unemployment story.</span></h1>
          <p>Explore labor-market patterns, compare regions, and examine how unemployment shifted around the COVID-19 outbreak.</p>
          <div className="hero-meta"><span><CalendarDays size={15} /> {summary ? `${summary.date_min} — ${summary.date_max}` : 'Waiting for dataset'}</span><span><Database size={15} /> {summary ? `${summary.rows.toLocaleString()} cleaned records` : 'No dataset loaded'}</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div>
          <div className="art-core"><TrendingUp size={54} /></div>
          <div className="art-chip chip-a"><span className="mini-dot"></span> LABOR MARKET</div>
          <div className="art-chip chip-b"><Activity size={15} /> DATA-DRIVEN</div>
          <div className="art-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
      </section>

      {error && <div className="alert alert-error"><AlertCircle size={19} /><span>{error}</span></div>}
      {notice && <div className="alert alert-success"><CheckCircle2 size={19} /><span>{notice}</span></div>}

      {!summary && !loading && <section className="empty-state">
        <div className="empty-icon"><FileSpreadsheet size={28} /></div><h2>Load an unemployment dataset</h2>
        <p>Upload the Kaggle Unemployment in India CSV below, or place it in <code>server/data/</code> and restart the server.</p>
        <a href="https://www.kaggle.com/datasets/gokulrajkmv/unemployment-in-india" target="_blank" rel="noreferrer">Find the dataset <ChevronRight size={15} /></a>
      </section>}

      <section className="stats-grid">
        <StatCard icon={Activity} label="Average unemployment" value={summary ? fmt(summary.mean_rate) : '—'} note="Across all valid observations" />
        <StatCard icon={BarChart3} label="Median rate" value={summary ? fmt(summary.median_rate) : '—'} note="Middle observation" />
        <StatCard icon={TrendingUp} label="Highest recorded" value={summary ? fmt(summary.max_rate) : '—'} note="Maximum in loaded dataset" />
        <StatCard icon={Users} label="Regions covered" value={summary ? summary.regions_count : '—'} note="Unique regional records" />
      </section>

      <div className="section-title" id="trends"><div><span className="section-kicker">01 / TIME SERIES</span><h2>Trends over time</h2><p>Track changes and look for a visible shift around March 2020.</p></div></div>
      <div className="content-grid">
        <Panel title="Unemployment rate timeline" subtitle="Mean rate across regions by month" className="wide-panel">
          {loading ? <div className="chart-loading"><LoaderCircle className="spin" /> Loading chart…</div> :
            monthly.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={310}>
              <LineChart data={monthly} margin={{ top: 10, right: 18, left: -16, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={25} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={v => fmt(v)} labelStyle={{ color: '#17233b' }} />
                <Line type="monotone" dataKey="rate" name="Unemployment" stroke="#4776e6" strokeWidth={3} dot={{ r: 3, fill: '#4776e6' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer></div> : <div className="chart-empty">Upload a dataset to view trends.</div>}
          <div className="chart-footnote"><span className="legend-line"></span> Monthly average <span className="footnote-muted">· March 2020 is the pandemic comparison boundary</span></div>
        </Panel>
        <Panel title="COVID-19 comparison" subtitle="Average rate before and from March 2020 onward">
          {summary?.period_comparison?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={310}>
            <BarChart data={summary.period_comparison} margin={{ top: 15, right: 8, left: -18, bottom: 35 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} angle={-12} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="rate" name="Average rate" fill="#f29a61" radius={[6, 6, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer></div> : <div className="chart-empty">Upload a dataset to compare periods.</div>}
          <p className="insight-note"><ShieldCheck size={16} /> This is a descriptive comparison, not proof that COVID-19 alone caused the change.</p>
        </Panel>
      </div>

      <div className="section-title" id="regions"><div><span className="section-kicker">02 / GEOGRAPHY & SEASONALITY</span><h2>Regional and monthly patterns</h2><p>Find where average rates differ and whether calendar-month patterns appear.</p></div></div>
      <div className="content-grid">
        <Panel title="Regional unemployment" subtitle="Average rate by region, ranked highest to lowest">
          {summary?.regions?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={Math.max(300, Math.min(560, summary.regions.length * 29))}>
            <BarChart data={summary.regions} layout="vertical" margin={{ top: 5, right: 22, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="region" width={112} tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="rate" name="Average rate" fill="#39a99a" radius={[0, 5, 5, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer></div> : <div className="chart-empty">Regional comparison appears after upload.</div>}
          {summary?.highest_region && <div className="region-callouts"><div><span>Highest average</span><strong>{summary.highest_region.name}</strong><b>{fmt(summary.highest_region.rate)}</b></div><div><span>Lowest average</span><strong>{summary.lowest_region.name}</strong><b>{fmt(summary.lowest_region.rate)}</b></div></div>}
        </Panel>
        <Panel title="Calendar-month averages" subtitle="An exploratory view of possible seasonality">
          {summary?.seasonality?.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={310}>
            <BarChart data={summary.seasonality} margin={{ top: 10, right: 8, left: -18, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="rate" name="Average rate" fill="#8b78df" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div> : <div className="chart-empty">Monthly pattern appears after upload.</div>}
          <p className="insight-note"><CalendarDays size={16} /> Calendar-month differences can reflect seasonality, sampling, or regional composition. Confirm with multiple years before drawing conclusions.</p>
        </Panel>
      </div>

      <section className="policy-panel">
        <div className="policy-symbol"><BriefcaseBusiness size={24} /></div>
        <div className="policy-copy"><span className="section-kicker">03 / POLICY LENS</span><h2>Turn patterns into better questions.</h2><p>Use these findings as starting points for targeted employment research—not as a substitute for a full causal study.</p></div>
        <div className="policy-points">
          <div><span>01</span><p><strong>Target support</strong>Identify regions with persistently high rates and evaluate local job-creation programs.</p></div>
          <div><span>02</span><p><strong>Build resilience</strong>Consider temporary wage support, job-matching services, and reskilling during economic shocks.</p></div>
          <div><span>03</span><p><strong>Measure outcomes</strong>Track employment, labor-force participation, wages, and job quality—not unemployment alone.</p></div>
        </div>
      </section>

      <section className="dataset-section" id="dataset">
        <div className="section-title"><div><span className="section-kicker">04 / DATA MANAGEMENT</span><h2>Dataset & data quality</h2><p>Upload a CSV to run the analysis on your own data.</p></div></div>
        <div className="dataset-grid">
          <Panel title="Upload unemployment CSV" subtitle="The source file is cleaned before analysis">
            <form className="upload-form" onSubmit={handleUpload}>
              <label className="drop-zone">
                <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} />
                <CloudUpload size={28} /><strong>{file ? file.name : 'Choose a CSV file'}</strong>
                <span>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'Click to browse your computer'}</span>
              </label>
              <button className="button button-primary full-button" disabled={uploading}>{uploading ? <LoaderCircle size={16} className="spin" /> : <CloudUpload size={16} />}{uploading ? 'Analyzing dataset…' : 'Upload and analyze'}</button>
            </form>
            <a className="text-link" href="https://www.kaggle.com/datasets/gokulrajkmv/unemployment-in-india" target="_blank" rel="noreferrer">Get the sample dataset <ChevronRight size={15} /></a>
          </Panel>
          <Panel title="Current dataset" subtitle="Source and coverage details">
            <div className="dataset-detail"><span>Source file</span><strong>{summary?.source || 'No dataset loaded'}</strong></div>
            <div className="dataset-detail"><span>Valid records</span><strong>{summary ? summary.rows.toLocaleString() : '—'}</strong></div>
            <div className="dataset-detail"><span>Date coverage</span><strong>{summary ? `${summary.date_min} to ${summary.date_max}` : '—'}</strong></div>
            <div className="dataset-detail"><span>Regions</span><strong>{summary ? summary.regions_count : '—'}</strong></div>
            <a className={`button button-secondary full-button ${!summary ? 'disabled-link' : ''}`} href={summary ? getCleanedCsvUrl() : undefined} onClick={e => { if (!summary) e.preventDefault() }}><Download size={16} /> Download cleaned CSV</a>
          </Panel>
        </div>
      </section>

      <footer className="footer"><a className="footer-brand" href="#top"><Activity size={17} /> LaborLens</a><span>"National Unemployment Insights Dashboard | Designed for Economic Research & Policy Analysis | © 2026"</span><span>Practical analysis . Interpret responsibly</span></footer>
    </main>
  </div>
}
