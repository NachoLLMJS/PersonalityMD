import './styles.css'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const identityGrid = $('#identityGrid')
const toast = $('#toast')

const identities = [
  { name: 'NOVA REYES', handle: '@nova_afterdark', role: 'CULTURE FORECASTER', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-01.mp4', poster: '/videos/personality-01-poster.jpg' },
  { name: 'ORBIT KAI', handle: '@orbitbuilds', role: 'TECH EXPLAINER', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-02.mp4', poster: '/videos/personality-02-poster.jpg' },
  { name: 'MIRA VALE', handle: '@miravale', role: 'DIGITAL FASHION EDITOR', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-03.mp4', poster: '/videos/personality-03-poster.jpg' },
  { name: 'ECHO 441', handle: '@echo441', role: 'SYNTHETIC MUSIC HOST', state: 'GENERATED VIDEO EXAMPLE', video: '/videos/personality-04.mp4', poster: '/videos/personality-04-poster.jpg' },
]

const pad = (value) => String(value).padStart(3, '0')

function showToast(message) {
  toast.textContent = message.replaceAll('.', '')
  toast.classList.add('visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2600)
}

function identityCard(identity, index) {
  const article = document.createElement('article')
  article.className = 'identity-card'
  article.tabIndex = 0
  article.setAttribute('role', 'button')
  article.setAttribute('aria-label', `Inspect ${identity.name}`)

  const visual = document.createElement('div')
  visual.className = 'identity-visual'
  const video = document.createElement('video')
  video.src = identity.video
  video.poster = identity.poster
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'metadata'
  video.setAttribute('aria-label', `Vertical video example for ${identity.name}`)
  const videoLabel = document.createElement('span')
  videoLabel.className = 'video-label'
  videoLabel.textContent = 'AI VIDEO · HOVER TO PLAY'
  visual.append(video, videoLabel)

  const meta = document.createElement('div')
  meta.className = 'identity-meta'
  const handle = document.createElement('span')
  handle.textContent = identity.handle
  const id = document.createElement('span')
  id.textContent = `ID P-${pad(index + 14)}`
  meta.append(handle, id)

  const name = document.createElement('h3')
  name.textContent = identity.name
  const role = document.createElement('p')
  role.textContent = identity.role
  const state = document.createElement('span')
  state.className = 'identity-state'
  state.textContent = identity.state
  article.append(visual, meta, name, role, state)

  const select = () => {
    $$('.identity-card.selected').forEach((card) => card.classList.remove('selected'))
    article.classList.add('selected')
    showToast(`${identity.name} selected`)
  }
  article.addEventListener('click', select)
  article.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select()
    }
  })

  const playVideo = () => video.play().catch(() => {})
  const resetVideo = () => { video.pause(); video.currentTime = 0 }
  article.addEventListener('pointerenter', playVideo)
  article.addEventListener('pointerleave', resetVideo)
  article.addEventListener('focusin', playVideo)
  article.addEventListener('focusout', resetVideo)
  return article
}

identityGrid.replaceChildren(...identities.map(identityCard))
window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', window.scrollY > 8), { passive: true })
