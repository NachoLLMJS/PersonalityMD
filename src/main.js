import './styles.css'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const identityGrid = $('#identityGrid')
const toast = $('#toast')
const terminalLog = $('#terminalLog')
const terminalForm = $('#personalityForm')
const terminalInput = $('#personalityPrompt')
const jobsGrid = $('#jobsGrid')
const jobsUpdated = $('#jobsUpdated')
const previewName = $('#previewName')
const previewVoice = $('#previewVoice')

let liveJobs = []
let currentFilter = 'all'

const identities = [
  { name: 'NOVA REYES', handle: '@nova_afterdark', role: 'CULTURE FORECASTER', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-01.mp4', poster: '/videos/personality-01-poster.jpg' },
  { name: 'ORBIT KAI', handle: '@orbitbuilds', role: 'TECH EXPLAINER', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-02.mp4', poster: '/videos/personality-02-poster.jpg' },
  { name: 'MIRA VALE', handle: '@miravale', role: 'DIGITAL FASHION EDITOR', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-03.mp4', poster: '/videos/personality-03-poster.jpg' },
  { name: 'ECHO 441', handle: '@echo441', role: 'SYNTHETIC MUSIC HOST', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-04.mp4', poster: '/videos/personality-04-poster.jpg' },
]

const pad = (value) => String(value).padStart(3, '0')
const stripStops = (value = '') => String(value).replaceAll('.', '').trim()
const safeText = (value = '') => stripStops(value).replace(/\s+/g, ' ')

function showToast(message, tone = 'blue') {
  toast.textContent = stripStops(message)
  toast.dataset.tone = tone
  toast.classList.add('visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3400)
}

function identityCard(identity, index) {
  const article = document.createElement('article')
  article.className = 'identity-card'
  article.tabIndex = 0
  article.setAttribute('role', 'button')
  article.setAttribute('aria-label', `Inspect ${identity.name}`)
  article.innerHTML = `
    <div class="identity-visual">
      <video src="${identity.video}" poster="${identity.poster}" muted loop playsinline preload="metadata" aria-label="Vertical video example for ${identity.name}"></video>
      <span class="video-label">AI VIDEO · HOVER TO PLAY</span>
    </div>
    <div class="identity-meta"><span>${identity.handle}</span><span>ID P-${pad(index + 14)}</span></div>
    <h3>${identity.name}</h3><p>${identity.role}</p><span class="identity-state">${identity.state}</span>`

  const select = () => {
    $$('.identity-card.selected').forEach((card) => card.classList.remove('selected'))
    article.classList.add('selected')
    previewName.textContent = identity.name
    previewVoice.textContent = identity.role
    showToast(`${identity.name} selected`)
  }
  article.addEventListener('click', select)
  article.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select()
    }
  })

  const video = $('video', article)
  const playVideo = () => video.play().catch(() => {})
  const resetVideo = () => { video.pause(); video.currentTime = 0 }
  article.addEventListener('pointerenter', playVideo)
  article.addEventListener('pointerleave', resetVideo)
  article.addEventListener('focusin', playVideo)
  article.addEventListener('focusout', resetVideo)
  return article
}

identityGrid.replaceChildren(...identities.map(identityCard))

function addWrongCommand(command) {
  const line = document.createElement('p')
  line.className = 'wrong-command'
  const entered = safeText(command).slice(0, 44)
  line.innerHTML = `<time>${new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}</time> <em>error</em> <span class="agent-glyph">⛌</span> <strong>WRONG COMMAND</strong>${entered ? ` <span class="command-echo">${entered}</span>` : ''}`
  terminalLog.append(line)
  while (terminalLog.children.length > 6) terminalLog.firstElementChild.remove()
}

terminalForm.addEventListener('submit', (event) => {
  event.preventDefault()
  addWrongCommand(terminalInput.value)
  terminalInput.value = ''
})

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
  const value = `${job.template || ''} ${job.objective || ''}`.toLowerCase()
  return /video|image|media|audio|creative|content|visual|avatar|character|influencer/.test(value)
}

function isActiveJob(job) {
  return !['completed', 'blocked', 'failed', 'cancelled', 'superseded'].includes(String(job.state).toLowerCase())
}

function filteredJobs() {
  if (currentFilter === 'media') return liveJobs.filter(isMediaJob)
  if (currentFilter === 'active') return liveJobs.filter(isActiveJob)
  return liveJobs
}

function renderJobs() {
  const jobs = filteredJobs()
  if (!jobs.length) {
    jobsGrid.innerHTML = `<div class="jobs-empty">NO REAL IMD JOBS MATCH THIS FILTER</div>`
    return
  }
  jobsGrid.replaceChildren(...jobs.slice(0, 12).map((job) => {
    const article = document.createElement('article')
    const state = safeText(job.state || 'unknown').toUpperCase()
    article.className = 'job-card'
    article.innerHTML = `
      <div class="job-card-head"><span class="job-state state-${state.toLowerCase()}">${state}</span><time>${relativeTime(job.updatedAt || job.createdAt)}</time></div>
      <h3>${safeText(job.objective || 'Objective unavailable')}</h3>
      <div class="job-card-foot"><span>${safeText(job.template || (isMediaJob(job) ? 'MEDIA JOB' : 'IMD JOB')).toUpperCase()}</span><code>${safeText(job.id || '').slice(0, 8)}</code></div>`
    return article
  }))
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
    jobsGrid.innerHTML = `<div class="jobs-error">LIVE IMD FEED UNAVAILABLE<br><small>${safeText(error.message)}</small></div>`
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

$('#connectButton').addEventListener('click', async () => {
  if (!window.ethereum) {
    showToast('No browser wallet detected', 'red')
    return
  }
  try {
    const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    $('#connectButton').textContent = `${address.slice(0, 5)}…${address.slice(-4)}`
    showToast('Wallet connected locally · payment remains disabled')
  } catch {
    showToast('Wallet connection cancelled', 'red')
  }
})

$$('.swarm-node').forEach((node) => node.addEventListener('mouseenter', () => {
  $$('.swarm-node.active').forEach((active) => active.classList.remove('active'))
  node.classList.add('active')
}))

window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', window.scrollY > 8), { passive: true })

loadJobs()
