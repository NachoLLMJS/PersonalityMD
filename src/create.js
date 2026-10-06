import './create.css'
import { x402Client } from '@x402/core/client'
import { encodePaymentSignatureHeader } from '@x402/core/http'
import { ExactEvmScheme, createPermit2ApprovalTx, getPermit2AllowanceReadParams } from '@x402/evm/exact/client'
import { createPublicClient, createWalletClient, custom, getAddress } from 'viem'
import { mainnet } from 'viem/chains'
import {
  buildQuoteApproval,
  buildSpendControls,
  extractQuoteOrder,
  formatPaymentAmount,
  paymentStatusLabel,
} from './imd-payment.js'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const form = $('#creatorForm')
const objectivePreview = $('#objectivePreview')
const validationResult = $('#validationResult')
const validateButton = $('#validateRequest')
const quoteButton = $('#createQuote')
const toast = $('#toast')
const preview = $('#selectedPreview')
const paymentPanel = $('#paymentPanel')
const paymentButton = $('#payAndStart')
const paymentState = $('#paymentState')
const refreshPaymentStatusButton = $('#refreshPaymentStatus')
const paymentJobLink = $('#paymentJobLink')
const connectButton = $('#connectButton')
const imdFlow = $('#imdFlow')
const higgsfieldFlow = $('#higgsfieldFlow')
const higgsfieldView = $('#higgsfieldView')
const providerState = $('#providerState')
const outputStepCopy = $('#outputStepCopy')
const swarmProgress = $('#swarmProgress')
const selectImdProviderButton = $('#selectImdProvider')
const selectHiggsfieldProviderButton = $('#selectHiggsfieldProvider')
const verifyHolderButton = $('#verifyHolder')
const generateInfluencerButton = $('#generateInfluencer')
const holderStatus = $('#holderStatus')
const holderMinimum = $('#holderMinimum')
const generationProgress = $('#generationProgress')
const imageGenerationState = $('#imageGenerationState')
const videoGenerationState = $('#videoGenerationState')
const generationResults = $('#generationResults')
const generatedInfluencerImage = $('#generatedInfluencerImage')
const generatedInfluencerVideo = $('#generatedInfluencerVideo')
const swarmLaunch = $('#swarmLaunch')
const higgsfieldImageInput = $('#higgsfieldImageInput')
const higgsfieldVideoInput = $('#higgsfieldVideoInput')
const higgsfieldImageName = $('#higgsfieldImageName')
const higgsfieldVideoName = $('#higgsfieldVideoName')
const higgsfieldMotionPrompt = $('#higgsfieldMotionPrompt')

let checkedPayload = null
let currentOrder = null
let connectedAddress = null
let paymentMode = 'connect'
let paymentBusy = false
let activeProvider = 'higgsfield'
let higgsfieldSessionToken = null
let higgsfieldConfig = null
let higgsfieldBusy = false
let higgsfieldImageFile = null
let higgsfieldVideoFile = null
let higgsfieldImagePreviewUrl = null

const stripStops = (value = '') => String(value).replaceAll('.', '').trim()
const clean = (value = '') => stripStops(value).replace(/\s+/g, ' ')
const data = () => Object.fromEntries(new FormData(form).entries())
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const shortAddress = (address = '') => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'

function showToast(message, tone = 'blue') {
  toast.textContent = stripStops(message)
  toast.dataset.tone = tone
  toast.classList.add('visible')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3200)
}

function replaceStatusContent(element, icon, message) {
  const symbol = document.createElement('span')
  symbol.textContent = icon
  const copy = document.createElement('p')
  copy.textContent = clean(message)
  element.replaceChildren(symbol, copy)
}

function composeObjective(values) {
  const name = values.displayName || 'an original virtual influencer'
  const niche = values.niche || 'a defined creative niche'
  const appearance = `Character with a ${values.build || 'Slim'} build ${values.heritage || 'Mixed heritage'} visual reference ${values.ageRange || '25 to 34'} age range ${values.presentation || 'Feminine'} presentation ${values.hairstyle || 'Lavender blunt bob'} hairstyle and ${values.eyeColor || 'Brown'} eyes`
  const identity = values.brief ? `Identity brief ${stripStops(values.brief)}` : 'Create a coherent public identity with a distinct audience role and visual world'
  const voice = `Use ${values.archetype || 'The Creator'} as the archetype with a ${values.tone || 'Warm and conversational'} voice in ${values.language || 'English'}`
  const boundaries = values.boundaries ? `Values and boundaries ${stripStops(values.boundaries)}` : 'Always disclose that the personality is AI generated and never impersonate a real person'
  const output = `First production ${values.output || 'Identity portrait and 9:16 introduction video'}`
  return [`Create a coherent virtual influencer called ${name} for ${niche}`, appearance, identity, voice, boundaries, output, 'Maintain the same recognizable identity across every image and video'].filter(Boolean).join(' — ')
}

function buildInput(values) {
  const objective = composeObjective(values)
  if (values.output === '9:16 social video') return { objective, skill: 'create-video', outputs: [{ name: 'introduction', path: 'artifacts/introduction.mp4', mediaType: 'video/mp4' }], github: false }
  if (values.output === 'Character reference image pack') return { objective, skill: 'create-image', outputs: [{ name: 'character-reference', path: 'artifacts/character-reference.png', mediaType: 'image/png' }], github: false }
  return {
    objective,
    shape: 'chain',
    steps: [
      { skill: 'create-image', objective: `Create the definitive original character portrait for ${values.displayName || 'the virtual influencer'}`, outputs: [{ name: 'portrait', path: 'artifacts/portrait.png', mediaType: 'image/png' }] },
      { skill: 'create-video', objective: 'Create a polished 9:16 introduction video using the same identity visual direction and personality', outputs: [{ name: 'introduction', path: 'artifacts/introduction.mp4', mediaType: 'video/mp4' }] },
    ],
    github: false,
  }
}

function selectedImage(name) {
  return $(`input[name="${name}"]:checked`)?.closest('label')?.querySelector('img')?.src || ''
}

function shortOutput(value) {
  if (value === '9:16 social video') return 'VERTICAL VIDEO'
  if (value === 'Character reference image pack') return 'IMAGE PACK'
  return 'PORTRAIT + VIDEO'
}

function resetPayment() {
  currentOrder = null
  paymentPanel.hidden = true
  paymentButton.hidden = false
  refreshPaymentStatusButton.hidden = true
  paymentJobLink.hidden = true
  sessionStorage.removeItem('personalityImdOrderId')
}

function updatePreview() {
  const values = data()
  const facts = $$('.studio-facts dd')
  facts[0].textContent = clean(values.niche || 'NOT SELECTED').toUpperCase()
  facts[1].textContent = clean(values.heritage || 'BLACK').toUpperCase()
  facts[2].textContent = clean(values.tone || 'WARM').toUpperCase()
  facts[3].textContent = shortOutput(values.output)
  $('img', preview).src = selectedImage('heritage') || '/references/heritage-1.webp'
  $('b', preview).textContent = clean(values.displayName || 'UNNAMED').toUpperCase()
  $('span', preview).textContent = `${clean(values.heritage || 'Black')} · ${clean(values.build || 'Slim')} · ${clean(values.hairstyle || 'Lavender blunt bob')}`.toUpperCase()
  objectivePreview.textContent = composeObjective(values)
  checkedPayload = null
  quoteButton.disabled = true
  validationResult.className = 'studio-validation'
  replaceStatusContent(validationResult, '⌬', 'Request changed · run live validation again')
  resetPayment()
}

form.addEventListener('input', updatePreview)
form.addEventListener('change', updatePreview)

function setValidation(status, message) {
  validationResult.className = `studio-validation ${status}`
  replaceStatusContent(validationResult, status === 'success' ? '◆' : status === 'loading' ? '⌬' : '⛌', message)
}

async function responseJson(response) {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: text } }
}

function resultError(result, response) {
  const problem = Array.isArray(result?.problems) ? result.problems.map((item) => item.detail || item.code || String(item)).join(' · ') : ''
  return result?.detail || result?.message || problem || result?.error || `IMD returned ${response.status}`
}

function setProvider(provider) {
  activeProvider = provider
  const useHiggsfield = provider === 'higgsfield'
  higgsfieldView.hidden = !useHiggsfield
  form.hidden = useHiggsfield
  swarmProgress.hidden = useHiggsfield
  imdFlow.hidden = useHiggsfield
  higgsfieldFlow.hidden = !useHiggsfield
  providerState.textContent = useHiggsfield ? 'HIGGSFIELD LIVE' : 'SWARM LIVE'
  outputStepCopy.textContent = useHiggsfield ? 'Upload one identity image and one MP4 motion reference up to 5 seconds' : 'Choose the first deliverable the IMD media chain should validate'
  selectImdProviderButton.classList.toggle('active', !useHiggsfield)
  selectHiggsfieldProviderButton.classList.toggle('active', useHiggsfield)
  selectImdProviderButton.setAttribute('aria-pressed', String(!useHiggsfield))
  selectHiggsfieldProviderButton.setAttribute('aria-pressed', String(useHiggsfield))
  if (useHiggsfield && !higgsfieldConfig) loadHiggsfieldConfig()
}

function setHolderStatus(status, message) {
  holderStatus.className = `holder-status ${status || ''}`.trim()
  replaceStatusContent(holderStatus, status === 'success' ? '◆' : status === 'loading' ? '⌬' : status === 'error' ? '⛌' : '◇', message)
}

async function loadHiggsfieldConfig() {
  try {
    const response = await fetch('/api/higgsfield/config', { headers: { accept: 'application/json' } })
    const result = await responseJson(response)
    if (!response.ok) throw new Error(result.error || 'Higgsfield service is unavailable')
    higgsfieldConfig = result
    holderMinimum.textContent = `${new Intl.NumberFormat('en-US').format(Number(result.minimum))} PMD`
    swarmLaunch.href = result.launcherUrl
  } catch (error) {
    setHolderStatus('error', error.message)
    verifyHolderButton.disabled = true
  }
}

function higgsfieldHeaders(extra = {}) {
  if (!higgsfieldSessionToken) throw new Error('Verify an eligible PMD holder wallet first')
  return { authorization: `Bearer ${higgsfieldSessionToken}`, ...extra }
}

async function verifyHolderAccess() {
  if (higgsfieldBusy) return
  higgsfieldBusy = true
  verifyHolderButton.disabled = true
  generateInfluencerButton.disabled = true
  higgsfieldSessionToken = null
  try {
    const address = await ensureWallet()
    setHolderStatus('loading', 'Preparing a one-time wallet ownership challenge')
    const challengeResponse = await fetch('/api/higgsfield/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const challenge = await responseJson(challengeResponse)
    if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not create the holder challenge')
    setHolderStatus('loading', 'Sign the read-only message in your wallet · no transaction or payment')
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [challenge.message, address] })
    const verifyResponse = await fetch('/api/higgsfield/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, signature, challengeToken: challenge.challengeToken }),
    })
    const result = await responseJson(verifyResponse)
    if (!verifyResponse.ok) {
      if (result.eligible === false) throw new Error(`Wallet holds ${result.balance || '0'} PMD · ${result.minimum || '100000'} required`)
      throw new Error(result.error || 'Holder verification failed')
    }
    higgsfieldSessionToken = result.token
    higgsfieldImageInput.disabled = false
    higgsfieldVideoInput.disabled = false
    updateHiggsfieldAvailability()
    setHolderStatus('success', `Eligible holder confirmed · ${result.balance} PMD · select one image and one MP4 up to 5 seconds`)
    showToast('Higgsfield creator unlocked')
  } catch (error) {
    setHolderStatus('error', error.message)
    showToast(error.message, 'red')
  } finally {
    verifyHolderButton.disabled = false
    higgsfieldBusy = false
  }
}

function updateHiggsfieldAvailability() {
  const ready = Boolean(higgsfieldSessionToken && higgsfieldImageFile && higgsfieldVideoFile && !higgsfieldBusy)
  generateInfluencerButton.disabled = !ready
}

function validateReferenceImage(file) {
  if (!file) throw new Error('Select one identity image')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Identity image must be JPG PNG WEBP or GIF')
  if (file.size > 15 * 1024 * 1024) throw new Error('Identity image must be 15 MB or smaller')
  return file
}

async function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const finish = () => URL.revokeObjectURL(url)
    video.preload = 'metadata'
    video.onloadedmetadata = () => { const duration = video.duration; finish(); resolve(duration) }
    video.onerror = () => { finish(); reject(new Error('Could not read the reference video')) }
    video.src = url
  })
}

async function validateReferenceVideo(file) {
  if (!file) throw new Error('Select one motion reference video')
  if (file.type !== 'video/mp4') throw new Error('Motion reference must be MP4')
  if (file.size > 50 * 1024 * 1024) throw new Error('Motion reference must be 50 MB or smaller')
  const duration = await readVideoDuration(file)
  if (!Number.isFinite(duration) || duration <= 0 || duration > 5.05) throw new Error('Motion reference must be no longer than 5 seconds')
  return file
}

async function selectHiggsfieldImage() {
  try {
    higgsfieldImageFile = validateReferenceImage(higgsfieldImageInput.files?.[0])
    higgsfieldImageName.textContent = higgsfieldImageFile.name
    if (higgsfieldImagePreviewUrl) URL.revokeObjectURL(higgsfieldImagePreviewUrl)
    higgsfieldImagePreviewUrl = URL.createObjectURL(higgsfieldImageFile)
    generatedInfluencerImage.src = higgsfieldImagePreviewUrl
    setHolderStatus('success', 'Identity image ready · add one MP4 motion reference up to 5 seconds')
  } catch (error) {
    higgsfieldImageFile = null
    higgsfieldImageInput.value = ''
    higgsfieldImageName.textContent = 'SELECT ONE IMAGE'
    setHolderStatus('error', error.message)
  }
  updateHiggsfieldAvailability()
}

async function selectHiggsfieldVideo() {
  try {
    higgsfieldVideoFile = await validateReferenceVideo(higgsfieldVideoInput.files?.[0])
    higgsfieldVideoName.textContent = higgsfieldVideoFile.name
    setHolderStatus('success', 'Image and motion reference are ready')
  } catch (error) {
    higgsfieldVideoFile = null
    higgsfieldVideoInput.value = ''
    higgsfieldVideoName.textContent = 'SELECT ONE MP4'
    setHolderStatus('error', error.message)
  }
  updateHiggsfieldAvailability()
}

async function uploadHiggsfieldReference(file, kind) {
  const response = await fetch('/api/higgsfield/upload-ticket', {
    method: 'POST',
    headers: higgsfieldHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  })
  const result = await responseJson(response)
  if (!response.ok || !result.uploadUrl || !result.publicUrl || !result.receipt) throw new Error(result.error || `Could not prepare the ${kind} reference upload`)
  const stored = await fetch(result.uploadUrl, { method: 'PUT', headers: result.uploadHeaders || { 'Content-Type': file.type }, body: file, credentials: 'omit' })
  if (!stored.ok) throw new Error(`Could not upload the ${kind} reference`)
  return { publicUrl: result.publicUrl, receipt: result.receipt }
}

async function startHiggsfieldJob(route, payload) {
  const response = await fetch(route, {
    method: 'POST',
    headers: higgsfieldHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  const result = await responseJson(response)
  if (!response.ok || !result.requestId || !result.jobToken) throw new Error(result.error || 'Higgsfield did not return a job id')
  return result
}

async function pollHiggsfieldJob(jobToken, onStatus) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (attempt) await delay(2000)
    const response = await fetch(`/api/higgsfield/status?job=${encodeURIComponent(jobToken)}`, { headers: higgsfieldHeaders() })
    const result = await responseJson(response)
    if (!response.ok) throw new Error(result.error || 'Could not read Higgsfield job status')
    const status = String(result.status || 'processing').toLowerCase()
    onStatus(status)
    if (status === 'completed') return result
    if (['failed', 'cancelled', 'canceled'].includes(status)) throw new Error(result.error || 'Higgsfield generation failed')
  }
  throw new Error('Higgsfield generation is still running · try again shortly')
}

async function generateHiggsfieldInfluencer() {
  if (higgsfieldBusy || !higgsfieldSessionToken) return
  const imageFile = validateReferenceImage(higgsfieldImageFile)
  const videoFile = await validateReferenceVideo(higgsfieldVideoFile)
  higgsfieldBusy = true
  generateInfluencerButton.disabled = true
  verifyHolderButton.disabled = true
  higgsfieldImageInput.disabled = true
  higgsfieldVideoInput.disabled = true
  generationProgress.hidden = false
  generationResults.hidden = true
  swarmLaunch.hidden = true
  generatedInfluencerVideo.removeAttribute('src')
  try {
    imageGenerationState.textContent = 'UPLOADING REFERENCES'
    videoGenerationState.textContent = 'MOTION WAITING'
    const [imageReference, videoReference] = await Promise.all([
      uploadHiggsfieldReference(imageFile, 'image'),
      uploadHiggsfieldReference(videoFile, 'video'),
    ])
    imageGenerationState.textContent = 'REFERENCES READY'
    videoGenerationState.textContent = 'MOTION SUBMITTING'
    const job = await startHiggsfieldJob('/api/higgsfield/generate-motion', {
      prompt: higgsfieldMotionPrompt.value.trim(),
      imageReceipt: imageReference.receipt,
      videoReceipt: videoReference.receipt,
    })
    const result = await pollHiggsfieldJob(job.jobToken, (status) => { videoGenerationState.textContent = `MOTION ${status.toUpperCase()}` })
    const outputUrl = result.video?.url
    if (!outputUrl) throw new Error('Higgsfield completed without a video URL')
    generatedInfluencerVideo.src = outputUrl
    videoGenerationState.textContent = 'MOTION COMPLETE'
    generationResults.hidden = false
    swarmLaunch.hidden = false
    setHolderStatus('success', 'Higgsfield motion transfer complete · SWARM launch is now available')
    showToast('Higgsfield video ready · SWARM launch unlocked')
  } catch (error) {
    setHolderStatus('error', error.message)
    showToast(error.message, 'red')
  } finally {
    verifyHolderButton.disabled = false
    higgsfieldImageInput.disabled = !higgsfieldSessionToken
    higgsfieldVideoInput.disabled = !higgsfieldSessionToken
    higgsfieldBusy = false
    updateHiggsfieldAvailability()
  }
}

async function validateRequest() {
  if (!form.reportValidity()) return
  validateButton.disabled = true
  quoteButton.disabled = true
  setValidation('loading', 'Checking the live IMD planner')
  const payload = { action: 'job.open', input: buildInput(data()) }
  try {
    const response = await fetch('/api/imd/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await responseJson(response)
    if (!response.ok) throw new Error(resultError(result, response))
    const blockers = Array.isArray(result.blockers) ? result.blockers : []
    if (blockers.length) throw new Error(blockers.map((item) => item.detail || item.code || String(item)).join(' · '))
    const plan = Array.isArray(result.plan) ? result.plan.map((step) => step.title || step.skill).filter(Boolean).join(' → ') : 'IMD plan ready'
    checkedPayload = payload
    quoteButton.disabled = false
    setValidation('success', `${plan} · validation passed`)
  } catch (error) {
    setValidation('error', error.message)
  } finally {
    validateButton.disabled = false
  }
}

function requestToken() {
  let token = sessionStorage.getItem('personalityImdRequestToken')
  if (!/^[0-9a-f]{64}$/.test(token || '')) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    sessionStorage.setItem('personalityImdRequestToken', token)
  }
  return token
}

function paidHeaders(extra = {}) {
  return { 'x-personality-request-token': requestToken(), ...extra }
}

function quoteTerms() {
  const quote = currentOrder?.quote
  if (!quote?.payment || quote.payment.network !== 'eip155:1') throw new Error('This build only accepts IMD quotes on Ethereum Mainnet')
  return { quote, payment: quote.payment, amount: BigInt(quote.payment.amount) }
}

function setPaymentButton(mode, label, disabled = false) {
  paymentMode = mode
  paymentButton.textContent = label
  paymentButton.disabled = disabled
}

function renderPaymentPanel() {
  const { quote, payment } = quoteTerms()
  paymentPanel.hidden = false
  paymentButton.hidden = false
  refreshPaymentStatusButton.hidden = true
  paymentJobLink.hidden = true
  paymentState.textContent = paymentStatusLabel(currentOrder.status)
  $('#paymentPrice').textContent = `${formatPaymentAmount(payment.amount, payment.decimals)} IMD`
  $('#paymentNetwork').textContent = 'ETHEREUM MAINNET'
  $('#paymentAsset').textContent = shortAddress(payment.asset).toUpperCase()
  $('#paymentRecipient').textContent = shortAddress(payment.payTo).toUpperCase()
  $('#paymentExpiry').textContent = new Date(Number(quote.expiresAt) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  $('#paymentOrder').textContent = shortAddress(currentOrder.id).toUpperCase()
  setPaymentButton(connectedAddress ? 'check' : 'connect', connectedAddress ? 'CHECK PAYMENT READINESS' : 'CONNECT WALLET TO REVIEW PAYMENT')
  if (connectedAddress) refreshPaymentAction().catch((error) => setValidation('error', error.message))
}

async function createQuote() {
  if (!checkedPayload) return
  quoteButton.disabled = true
  setValidation('loading', 'Saving a real unpaid IMD quote')
  try {
    const response = await fetch('/api/imd/quote', { method: 'POST', headers: { 'content-type': 'application/json', ...paidHeaders() }, body: JSON.stringify({ ...checkedPayload, requestKey: crypto.randomUUID() }) })
    const result = await responseJson(response)
    if (!response.ok) throw new Error(resultError(result, response))
    currentOrder = extractQuoteOrder(result)
    sessionStorage.setItem('personalityImdOrderId', currentOrder.id)
    renderPaymentPanel()
    setValidation('success', `Real IMD quote ${currentOrder.id} ready · review price and confirm through the wallet to admit the job`)
    showToast('Real unpaid IMD quote created')
  } catch (error) {
    setValidation('error', error.message)
    quoteButton.disabled = false
  }
}

async function ensureWallet() {
  if (!window.ethereum) throw new Error('No browser wallet detected')
  const [rawAddress] = await window.ethereum.request({ method: 'eth_requestAccounts' })
  if (!rawAddress) throw new Error('Wallet connection cancelled')
  connectedAddress = getAddress(rawAddress)
  const chainId = await window.ethereum.request({ method: 'eth_chainId' })
  if (chainId !== '0x1') await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })
  connectButton.textContent = shortAddress(connectedAddress)
  return connectedAddress
}

function walletClients() {
  if (!window.ethereum || !connectedAddress) throw new Error('Connect an Ethereum wallet first')
  const transport = custom(window.ethereum)
  return {
    walletClient: createWalletClient({ account: connectedAddress, chain: mainnet, transport }),
    publicClient: createPublicClient({ chain: mainnet, transport }),
  }
}

async function refreshPaymentAction() {
  if (!currentOrder) return
  if (!connectedAddress) return setPaymentButton('connect', 'CONNECT WALLET TO REVIEW PAYMENT')
  setPaymentButton('busy', 'CHECKING PERMIT2 ALLOWANCE', true)
  const { payment, amount } = quoteTerms()
  const { publicClient } = walletClients()
  const allowance = await publicClient.readContract(getPermit2AllowanceReadParams({ tokenAddress: payment.asset, ownerAddress: connectedAddress }))
  if (allowance < amount) setPaymentButton('approve', 'APPROVE IMD FOR PERMIT2')
  else setPaymentButton('pay', `PAY ${formatPaymentAmount(payment.amount, payment.decimals)} IMD AND START`)
}

async function approvePermit2() {
  const { quote, payment } = quoteTerms()
  if (Math.floor(Date.now() / 1000) >= Number(quote.expiresAt)) throw new Error('The IMD quote expired · create a new quote')
  setPaymentButton('busy', 'WAITING FOR PERMIT2 APPROVAL', true)
  setValidation('loading', 'Your wallet will request a reusable IMD allowance for Permit2 · this does not pay for the job yet')
  const { walletClient, publicClient } = walletClients()
  const approval = createPermit2ApprovalTx(payment.asset)
  const hash = await walletClient.sendTransaction({ account: connectedAddress, chain: mainnet, to: approval.to, data: approval.data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Permit2 approval transaction failed')
  showToast('Permit2 approval confirmed')
  setValidation('success', 'Permit2 approval confirmed · review the payment amount and press pay to start the IMD job')
  await refreshPaymentAction()
}

function assertChallenge(challenge) {
  const { quote, payment } = quoteTerms()
  const accepted = challenge?.accepts?.[0]
  if (!accepted || challenge.x402Version !== 2 || challenge.quote?.id !== quote.id) throw new Error('IMD returned an invalid payment challenge')
  const sameTerms = accepted.network === payment.network && accepted.asset?.toLowerCase() === payment.asset.toLowerCase() && accepted.amount === payment.amount && accepted.payTo?.toLowerCase() === payment.payTo.toLowerCase()
  if (!sameTerms) throw new Error('IMD payment terms changed · create a new quote')
  return accepted
}

async function fetchPaymentStatus() {
  if (!currentOrder) throw new Error('No IMD order is active')
  const response = await fetch(`/api/imd/orders/${currentOrder.id}`, { headers: paidHeaders() })
  const result = await responseJson(response)
  if (!response.ok) throw new Error(resultError(result, response))
  currentOrder = result.order || currentOrder
  applyPaymentStatus(result)
  return result
}

function applyPaymentStatus(result) {
  paymentState.textContent = paymentStatusLabel(result.status)
  if (result.status === 'quoted') {
    paymentButton.hidden = false
    refreshPaymentStatusButton.hidden = true
    setValidation('success', 'Real IMD quote restored · connect the paying wallet and review the payment')
    return
  }
  if (result.status === 'admitted') {
    const admission = result.admission?.result
    const statusUrl = admission?.statusUrl
    paymentButton.hidden = true
    refreshPaymentStatusButton.hidden = true
    paymentJobLink.hidden = !statusUrl
    if (statusUrl) paymentJobLink.href = new URL(statusUrl, 'https://api.imd.fun').href
    setValidation('success', `IMD admitted the paid job ${admission?.jobId || currentOrder.id} · the work is now running on the real network`)
    showToast('IMD job admitted')
    return
  }
  if (result.status === 'payment_failed' || result.status === 'expired') {
    paymentButton.hidden = true
    refreshPaymentStatusButton.hidden = false
    if (result.status === 'expired') quoteButton.disabled = false
    setValidation('error', result.status === 'expired' ? 'The IMD quote expired · validate and create a new quote' : 'IMD rejected or could not confirm the payment · refresh status before retrying')
    return
  }
  paymentButton.hidden = true
  refreshPaymentStatusButton.hidden = false
  setValidation('loading', `${paymentStatusLabel(result.status)} · IMD is confirming payment and admitting the job`)
}

async function pollPaymentStatus() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(2000)
    const result = await fetchPaymentStatus()
    if (['admitted', 'payment_failed', 'expired'].includes(result.status)) return result
  }
  refreshPaymentStatusButton.hidden = false
  setValidation('loading', 'IMD is still processing the order · use refresh status to continue checking')
  return null
}

async function payAndSubmit() {
  const { quote } = quoteTerms()
  if (Math.floor(Date.now() / 1000) >= Number(quote.expiresAt) - 15) throw new Error('The IMD quote is too close to expiry · create a new quote')
  setPaymentButton('busy', 'REQUESTING IMD PAYMENT CHALLENGE', true)
  setValidation('loading', 'Requesting the exact x402 payment terms from IMD')
  const challengeResponse = await fetch(`/api/imd/orders/${currentOrder.id}/submit`, { method: 'POST', headers: paidHeaders() })
  const challenge = await responseJson(challengeResponse)
  if (challengeResponse.status !== 402) throw new Error(resultError(challenge, challengeResponse))
  const accepted = assertChallenge(challenge)
  const { walletClient } = walletClients()
  const signer = {
    address: connectedAddress,
    signTypedData: (typedData) => walletClient.signTypedData({ account: connectedAddress, ...typedData }),
  }
  setPaymentButton('busy', 'SIGNING X402 PAYMENT', true)
  setValidation('loading', 'Confirm the Permit2 payment signature in your wallet · no private key leaves the wallet')
  const client = x402Client.fromConfig({
    schemes: [{ network: accepted.network, client: new ExactEvmScheme(signer) }],
    spendControls: buildSpendControls(accepted),
  })
  const generated = await client.createPaymentPayload({ x402Version: 2, resource: challenge.resource, accepts: [accepted] })
  const { extensions: _extensions, ...withoutExtensions } = generated
  const payment = JSON.parse(JSON.stringify({ ...withoutExtensions, accepted }))
  const approval = buildQuoteApproval(challenge, payment)
  setPaymentButton('busy', 'SIGNING QUOTE APPROVAL', true)
  setValidation('loading', 'Confirm the second signature binding this exact payment to this exact IMD quote')
  const quoteSignature = await signer.signTypedData(approval)
  const encodedPayment = encodePaymentSignatureHeader(payment)
  setPaymentButton('busy', 'SUBMITTING PAYMENT TO IMD', true)
  const submitResponse = await fetch(`/api/imd/orders/${currentOrder.id}/submit`, {
    method: 'POST',
    headers: paidHeaders({ 'content-type': 'application/json', 'PAYMENT-SIGNATURE': encodedPayment }),
    body: JSON.stringify({ quoteSignature }),
  })
  const result = await responseJson(submitResponse)
  if (!submitResponse.ok && submitResponse.status !== 202) throw new Error(resultError(result, submitResponse))
  applyPaymentStatus(result)
  if (!['admitted', 'payment_failed', 'expired'].includes(result.status)) await pollPaymentStatus()
}

async function handlePaymentButton() {
  if (paymentBusy || !currentOrder) return
  paymentBusy = true
  try {
    if (paymentMode === 'connect') {
      await ensureWallet()
      showToast('Wallet connected · no payment requested')
      await refreshPaymentAction()
    } else if (paymentMode === 'check') {
      await refreshPaymentAction()
    } else if (paymentMode === 'approve') {
      await approvePermit2()
    } else if (paymentMode === 'pay') {
      await payAndSubmit()
    }
  } catch (error) {
    setValidation('error', error.message)
    showToast(error.message, 'red')
    if (currentOrder && !paymentButton.hidden) setPaymentButton(connectedAddress ? 'check' : 'connect', connectedAddress ? 'CHECK PAYMENT READINESS' : 'CONNECT WALLET TO REVIEW PAYMENT')
  } finally {
    paymentBusy = false
  }
}

async function restoreOrder() {
  const id = sessionStorage.getItem('personalityImdOrderId')
  if (!/^[0-9a-fA-F-]{36}$/.test(id || '')) return
  try {
    const response = await fetch(`/api/imd/orders/${id}`, { headers: paidHeaders() })
    const result = await responseJson(response)
    if (!response.ok) throw new Error(resultError(result, response))
    currentOrder = result.order
    renderPaymentPanel()
    applyPaymentStatus(result)
  } catch {
    sessionStorage.removeItem('personalityImdOrderId')
  }
}

validateButton.addEventListener('click', validateRequest)
quoteButton.addEventListener('click', createQuote)
paymentButton.addEventListener('click', handlePaymentButton)
refreshPaymentStatusButton.addEventListener('click', () => fetchPaymentStatus().catch((error) => setValidation('error', error.message)))
selectImdProviderButton.addEventListener('click', () => setProvider('imd'))
selectHiggsfieldProviderButton.addEventListener('click', () => setProvider('higgsfield'))
verifyHolderButton.addEventListener('click', verifyHolderAccess)
generateInfluencerButton.addEventListener('click', generateHiggsfieldInfluencer)
higgsfieldImageInput.addEventListener('change', selectHiggsfieldImage)
higgsfieldVideoInput.addEventListener('change', selectHiggsfieldVideo)
connectButton.addEventListener('click', async () => {
  try {
    await ensureWallet()
    showToast('Wallet connected · no payment requested')
    if (currentOrder) await refreshPaymentAction()
  } catch (error) {
    showToast(error.message, 'red')
  }
})

if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', ([address]) => {
    connectedAddress = address ? getAddress(address) : null
    connectButton.textContent = connectedAddress ? shortAddress(connectedAddress) : 'CONNECT'
    higgsfieldSessionToken = null
    higgsfieldImageInput.disabled = true
    higgsfieldVideoInput.disabled = true
    generateInfluencerButton.disabled = true
    if (activeProvider === 'higgsfield') setHolderStatus('', 'Wallet changed · verify the 100K PMD holding again')
    if (currentOrder) refreshPaymentAction().catch((error) => setValidation('error', error.message))
  })
  window.ethereum.on('chainChanged', () => {
    higgsfieldSessionToken = null
    higgsfieldImageInput.disabled = true
    higgsfieldVideoInput.disabled = true
    generateInfluencerButton.disabled = true
    if (activeProvider === 'higgsfield') setHolderStatus('', 'Network changed · switch to Ethereum Mainnet and verify again')
    if (currentOrder && connectedAddress) setPaymentButton('connect', 'SWITCH TO ETHEREUM MAINNET')
  })
}

const savedOrderId = sessionStorage.getItem('personalityImdOrderId')
updatePreview()
setProvider('higgsfield')
if (savedOrderId) sessionStorage.setItem('personalityImdOrderId', savedOrderId)
restoreOrder()
