import './styles.css'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const toast = $('#toast')
const terminalLog = $('#terminalLog')
const terminalForm = $('#personalityForm')
const terminalInput = $('#personalityPrompt')
const stripStops = (value = '') => String(value).replaceAll('.', '').trim()
const safeText = (value = '') => stripStops(value).replace(/\s+/g, ' ')

function showToast(message, tone = 'blue') {
  toast.textContent = stripStops(message)
  toast.dataset.tone = tone
  toast.classList.add('visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3400)
}


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
