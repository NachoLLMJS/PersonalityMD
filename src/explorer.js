import './styles.css'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const jobsGrid = $('#jobsGrid')
const jobsUpdated = $('#jobsUpdated')
let liveJobs = []
let currentFilter = 'all'

const safeText = (value = '') => String(value).replaceAll('.', '').replace(/\s+/g, ' ').trim()

function relativeTime(value) {
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return 'time unavailable'
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function isMediaJob(job) {
  return /video|image|media|audio|creative|content|visual|avatar|character|influencer/.test(`${job.template || ''} ${job.objective || ''}`.toLowerCase())
}

function isActiveJob(job) {
  return !['completed', 'blocked', 'failed', 'cancelled', 'superseded'].includes(String(job.state).toLowerCase())
}

function filteredJobs() {
  if (currentFilter === 'media') return liveJobs.filter(isMediaJob)
  if (currentFilter === 'active') return liveJobs.filter(isActiveJob)
  return liveJobs
}

function renderMessage(className, message, detail = '') {
  const element = document.createElement('div')
  element.className = className
  element.append(document.createTextNode(message))
  if (detail) {
    element.append(document.createElement('br'))
    const small = document.createElement('small')
    small.textContent = detail
    element.append(small)
  }
  jobsGrid.replaceChildren(element)
}

function jobCard(job) {
  const article = document.createElement('article')
  article.className = 'job-card'
  const head = document.createElement('div')
  head.className = 'job-card-head'
  const state = document.createElement('span')
  const stateText = safeText(job.state || 'unknown').toUpperCase()
  state.className = `job-state state-${stateText.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`
  state.textContent = stateText
  const time = document.createElement('time')
  time.textContent = relativeTime(job.updatedAt || job.createdAt)
  head.append(state, time)
  const title = document.createElement('h3')
  title.textContent = safeText(job.objective || 'Objective unavailable')
  const foot = document.createElement('div')
  foot.className = 'job-card-foot'
  const template = document.createElement('span')
  template.textContent = safeText(job.template || (isMediaJob(job) ? 'MEDIA JOB' : 'IMD JOB')).toUpperCase()
  const code = document.createElement('code')
  code.textContent = safeText(job.id || '').slice(0, 8)
  foot.append(template, code)
  article.append(head, title, foot)
  return article
}

function renderJobs() {
  const jobs = filteredJobs()
  if (!jobs.length) return renderMessage('jobs-empty', 'NO REAL IMD JOBS MATCH THIS FILTER')
  jobsGrid.replaceChildren(...jobs.slice(0, 12).map(jobCard))
}

async function loadJobs() {
  $('#refreshJobs').disabled = true
  jobsUpdated.textContent = 'reading live network'
  try {
    const response = await fetch('/api/imd/jobs?limit=60&exclude=oracle', { headers: { accept: 'application/json' } })
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || data.error || `IMD returned ${response.status}`)
    liveJobs = Array.isArray(data.jobs) ? data.jobs : []
    renderJobs()
    jobsUpdated.textContent = `${liveJobs.length} jobs received · ${relativeTime(new Date().toISOString())}`
  } catch (error) {
    renderMessage('jobs-error', 'LIVE IMD FEED UNAVAILABLE', safeText(error.message))
    jobsUpdated.textContent = 'connection failed'
  } finally {
    $('#refreshJobs').disabled = false
  }
}

$$('.job-filter').forEach((button) => button.addEventListener('click', () => {
  $$('.job-filter').forEach((item) => item.classList.remove('active'))
  button.classList.add('active')
  currentFilter = button.dataset.filter
  renderJobs()
}))

$('#refreshJobs').addEventListener('click', loadJobs)
window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', window.scrollY > 8), { passive: true })
loadJobs()
