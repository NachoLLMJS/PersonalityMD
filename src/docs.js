import './docs.css'

const links = [...document.querySelectorAll('.docs-sidebar nav a')]
const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean)

const setActive = (id) => {
  links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${id}`))
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
  if (visible) setActive(visible.target.id)
}, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.08, 0.25] })

sections.forEach((section) => observer.observe(section))

links.forEach((link) => link.addEventListener('click', () => setActive(link.getAttribute('href').slice(1))))
