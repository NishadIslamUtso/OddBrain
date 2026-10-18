/**
 * Design systems — visual languages an artifact can be generated in.
 *
 * Token sets are CSS custom properties taken from nexu-io/open-design
 * (Apache-2.0), which publishes 152 of them. Sixteen are bundled here.
 * A generated artifact is plain HTML from a 3B model; giving it a real token
 * set is the difference between "generic output" and something that looks
 * designed. Each set is a separate module so only the chosen one is loaded.
 */
export const DESIGN_SYSTEMS = [
  {
    "id": "claude",
    "label": "Claude",
    "accent": "#c96442",
    "bg": "#f5f4ed"
  },
  {
    "id": "default",
    "label": "Default",
    "accent": "#2f6feb",
    "bg": "#fafafa"
  },
  {
    "id": "minimal",
    "label": "Minimal",
    "accent": "#111111",
    "bg": "#ffffff"
  },
  {
    "id": "modern",
    "label": "Modern",
    "accent": "#4f46e5",
    "bg": "#f7f8fc"
  },
  {
    "id": "shadcn",
    "label": "Shadcn",
    "accent": "#000000",
    "bg": "#ffffff"
  },
  {
    "id": "linear-app",
    "label": "Linear App",
    "accent": "#5e6ad2",
    "bg": "#08090a"
  },
  {
    "id": "apple",
    "label": "Apple",
    "accent": "#0071e3",
    "bg": "#ffffff"
  },
  {
    "id": "stripe",
    "label": "Stripe",
    "accent": "#533afd",
    "bg": "#ffffff"
  },
  {
    "id": "notion",
    "label": "Notion",
    "accent": "#0075de",
    "bg": "#ffffff"
  },
  {
    "id": "vercel",
    "label": "Vercel",
    "accent": "#0070f3",
    "bg": "#ffffff"
  },
  {
    "id": "airbnb",
    "label": "Airbnb",
    "accent": "#ff385c",
    "bg": "#ffffff"
  },
  {
    "id": "neobrutalism",
    "label": "Neobrutalism",
    "accent": "#d24b1f",
    "bg": "#fff4cf"
  },
  {
    "id": "glassmorphism",
    "label": "Glassmorphism",
    "accent": "#4f8cff",
    "bg": "#eef6ff"
  },
  {
    "id": "editorial",
    "label": "Editorial",
    "accent": "#9a5a2f",
    "bg": "#fbf7f0"
  },
  {
    "id": "dashboard",
    "label": "Dashboard",
    "accent": "#0ea5e9",
    "bg": "#f4f7fb"
  },
  {
    "id": "retro",
    "label": "Retro",
    "accent": "#d24b1f",
    "bg": "#fff4cf"
  }
]

export const DEFAULT_DESIGN_SYSTEM = 'claude'

const loaders = {
  'claude': () => import('./claude.js'),
  'default': () => import('./default.js'),
  'minimal': () => import('./minimal.js'),
  'modern': () => import('./modern.js'),
  'shadcn': () => import('./shadcn.js'),
  'linear-app': () => import('./linear-app.js'),
  'apple': () => import('./apple.js'),
  'stripe': () => import('./stripe.js'),
  'notion': () => import('./notion.js'),
  'vercel': () => import('./vercel.js'),
  'airbnb': () => import('./airbnb.js'),
  'neobrutalism': () => import('./neobrutalism.js'),
  'glassmorphism': () => import('./glassmorphism.js'),
  'editorial': () => import('./editorial.js'),
  'dashboard': () => import('./dashboard.js'),
  'retro': () => import('./retro.js')
}

/** Load the CSS custom properties for one design system. */
export async function loadDesignTokens(id) {
  const load = loaders[id]
  if (!load) return ''
  const module = await load()
  return module.default
}

export function designSystemLabel(id) {
  return DESIGN_SYSTEMS.find(entry => entry.id === id)?.label || id
}
