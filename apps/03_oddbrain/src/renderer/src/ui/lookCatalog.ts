// Original palette values and preset assignments from the owner's OddBrain.html.
export const PALETTES = [
  {
    "id": "app",
    "name": "OddBrain default",
    "dark": true,
    "paper": "#141417",
    "panel": "#1a1a1f",
    "card": "#202027",
    "ink": "#ececef",
    "muted": "#9a9aa3",
    "line": "#2e2e36",
    "accent": "#7350ff",
    "pink": "#e8a0b4",
    "green": "#4f8d67",
    "amber": "#d5ad6b",
    "tint": "#282337"
  },
  {
    "id": "studio",
    "name": "Neutral",
    "hint": "Quiet paper, one accent",
    "dark": false,
    "paper": "#f7f7f5",
    "panel": "#efeeec",
    "card": "#ffffff",
    "ink": "#26262a",
    "muted": "#6d6d73",
    "line": "#e2e1de",
    "accent": "#4f5a75",
    "tint": "#eaecf1",
    "pink": "#c9ccd6",
    "green": "#3f7259",
    "greenTint": "#e6efe9",
    "amber": "#8a6a2f",
    "amberTint": "#f4eddc",
    "accentInk": "#ffffff"
  },
  {
    "id": "paper",
    "name": "Paper & Plum",
    "hint": "The original gallery",
    "dark": false,
    "paper": "#f8f7f3",
    "panel": "#f1eeea",
    "card": "#fffefa",
    "ink": "#302d34",
    "muted": "#756f7b",
    "line": "#e4dfe3",
    "accent": "#806390",
    "tint": "#eee7f2",
    "pink": "#efacb7",
    "green": "#447d61",
    "greenTint": "#e9f1e9",
    "amber": "#936820",
    "amberTint": "#faf0da",
    "accentInk": "#fffefa"
  },
  {
    "id": "midnight",
    "name": "Midnight Ink",
    "hint": "For late little ideas",
    "dark": true,
    "paper": "#17171d",
    "panel": "#1d1c24",
    "card": "#25242e",
    "ink": "#eeeaf1",
    "muted": "#aaa2b5",
    "line": "#3a3545",
    "accent": "#c1a3dd",
    "tint": "#352c42",
    "pink": "#efaebc",
    "green": "#9ccbb0",
    "greenTint": "#243a32",
    "amber": "#e8bf7e",
    "amberTint": "#423626",
    "accentInk": "#211828"
  },
  {
    "id": "sage",
    "name": "Sage Notes",
    "hint": "A little room to breathe",
    "dark": false,
    "paper": "#f2f5ef",
    "panel": "#e9eee5",
    "card": "#fdfef9",
    "ink": "#2c3d31",
    "muted": "#637367",
    "line": "#d7e0d3",
    "accent": "#52745c",
    "tint": "#e2ecde",
    "pink": "#eeb4b6",
    "green": "#3f795b",
    "greenTint": "#e2eddf",
    "amber": "#936b2c",
    "amberTint": "#f4edda",
    "accentInk": "#ffffff"
  },
  {
    "id": "peach",
    "name": "Peach Fuzz",
    "hint": "Warm, soft, unhurried",
    "dark": false,
    "paper": "#fcf1eb",
    "panel": "#f5e6df",
    "card": "#fffaf5",
    "ink": "#49372f",
    "muted": "#84685d",
    "line": "#ead8cf",
    "accent": "#a06060",
    "tint": "#f4dfe0",
    "pink": "#eda4ae",
    "green": "#5d785d",
    "greenTint": "#eaf0e4",
    "amber": "#9a6828",
    "amberTint": "#f8ebd9",
    "accentInk": "#ffffff"
  },
  {
    "id": "blue",
    "name": "Blue Hour",
    "hint": "Clear head, open sky",
    "dark": false,
    "paper": "#f0f4f9",
    "panel": "#e7edf5",
    "card": "#fcfdff",
    "ink": "#29374c",
    "muted": "#66758c",
    "line": "#d5deec",
    "accent": "#58729f",
    "tint": "#e1e8f7",
    "pink": "#e8a7bd",
    "green": "#407966",
    "greenTint": "#e0f0e8",
    "amber": "#98702e",
    "amberTint": "#f7edda",
    "accentInk": "#ffffff"
  },
  {
    "id": "citrus",
    "name": "Lemon Drop",
    "hint": "A fresh kind of focus",
    "dark": false,
    "paper": "#f8f8eb",
    "panel": "#efefdb",
    "card": "#fffef7",
    "ink": "#3d402b",
    "muted": "#73765b",
    "line": "#dfdfc9",
    "accent": "#747d39",
    "tint": "#ebedcd",
    "pink": "#edaab5",
    "green": "#58774c",
    "greenTint": "#e7eedb",
    "amber": "#916c27",
    "amberTint": "#f9edcf",
    "accentInk": "#ffffff"
  },
  {
    "id": "rose",
    "name": "Rose After Dark",
    "hint": "Midnight, with a blush",
    "dark": true,
    "paper": "#211a22",
    "panel": "#291f29",
    "card": "#322632",
    "ink": "#f4e8ef",
    "muted": "#b9a0b0",
    "line": "#4c394a",
    "accent": "#e4a6c1",
    "tint": "#493044",
    "pink": "#f0a3ba",
    "green": "#a8c8b2",
    "greenTint": "#2d4035",
    "amber": "#e3bb80",
    "amberTint": "#493726",
    "accentInk": "#301d2a"
  },
  {
    "id": "mono",
    "name": "Quiet Graphite",
    "hint": "Less colour, more thought",
    "dark": false,
    "paper": "#f4f4f2",
    "panel": "#eaeae7",
    "card": "#ffffff",
    "ink": "#282928",
    "muted": "#70716f",
    "line": "#ddddda",
    "accent": "#535851",
    "tint": "#e6e9e3",
    "pink": "#e8a8b4",
    "green": "#50735c",
    "greenTint": "#e5eee6",
    "amber": "#8b6e35",
    "amberTint": "#f3eddf",
    "accentInk": "#ffffff"
  }
] as const

export const LOOK_PRESETS = [
  {
    "id": "warm-editorial",
    "name": "Warm Editorial",
    "palette": "paper",
    "style": "editorial",
    "layout": "classic",
    "interfaceFont": "editorial",
    "motion": "balanced",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "idle",
      "thinking": "think",
      "working": "type",
      "waiting": "eye-roll",
      "done": "shades-drop",
      "searching": "flashlight-search",
      "making": "forge",
      "resting": "nap"
    }
  },
  {
    "id": "cozy-studio",
    "name": "Cozy Studio",
    "palette": "peach",
    "style": "soft",
    "layout": "topbar",
    "interfaceFont": "humanist",
    "motion": "calm",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "float",
      "thinking": "stir",
      "working": "bake",
      "waiting": "mochi-melt",
      "done": "self-hug",
      "searching": "peekaboo",
      "making": "grow",
      "resting": "hammock"
    }
  },
  {
    "id": "quiet-minimal",
    "name": "Quiet Minimal",
    "palette": "mono",
    "style": "editorial",
    "layout": "command",
    "interfaceFont": "system",
    "motion": "calm",
    "density": "compact",
    "collapsed": false,
    "roles": {
      "idle": "idle",
      "thinking": "compute",
      "working": "type",
      "waiting": "eye-roll",
      "done": "shades-drop",
      "searching": "lens-inspector",
      "making": "architect",
      "resting": "nap"
    }
  },
  {
    "id": "playful-lab",
    "name": "Playful Lab",
    "palette": "citrus",
    "style": "soft",
    "layout": "bento",
    "interfaceFont": "humanist",
    "motion": "playful",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "shimmy",
      "thinking": "wiggle",
      "working": "chaos",
      "waiting": "spin",
      "done": "confetti",
      "searching": "flashlight-search",
      "making": "juggle-body",
      "resting": "cheek-drums"
    }
  },
  {
    "id": "ink-sketchbook",
    "name": "Ink & Sketchbook",
    "palette": "paper",
    "style": "ink",
    "layout": "twopane",
    "interfaceFont": "serif",
    "motion": "balanced",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "sketch",
      "thinking": "idea",
      "working": "architect",
      "waiting": "unwind",
      "done": "sparkle",
      "searching": "lens-inspector",
      "making": "forge",
      "resting": "nap"
    }
  },
  {
    "id": "terminal-engine",
    "name": "Terminal / Engineer",
    "palette": "midnight",
    "style": "editorial",
    "layout": "console",
    "interfaceFont": "mono",
    "motion": "calm",
    "density": "compact",
    "collapsed": true,
    "roles": {
      "idle": "type",
      "thinking": "compute",
      "working": "hinge-tune",
      "waiting": "eye-roll",
      "done": "shades-drop",
      "searching": "flashlight-search",
      "making": "forge",
      "resting": "nap"
    }
  },
  {
    "id": "retro-desktop",
    "name": "Retro Desktop",
    "palette": "blue",
    "style": "editorial",
    "layout": "floating",
    "interfaceFont": "humanist",
    "motion": "balanced",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "wind-up",
      "thinking": "accordion",
      "working": "maestro",
      "waiting": "pocket-panic",
      "done": "megaphone",
      "searching": "flashlight-search",
      "making": "magnet",
      "resting": "hammock"
    }
  },
  {
    "id": "glass-future",
    "name": "Glass / Futuristic",
    "palette": "rose",
    "style": "glass",
    "layout": "rail",
    "interfaceFont": "system",
    "motion": "balanced",
    "density": "comfortable",
    "collapsed": false,
    "roles": {
      "idle": "float",
      "thinking": "spin",
      "working": "compute",
      "waiting": "balloon-brain",
      "done": "sparkle",
      "searching": "bubbles",
      "making": "transform",
      "resting": "lotus-float"
    }
  }
] as const

export const LAYOUTS = [
  { id: 'classic', label: 'Classic sidebar' },
  { id: 'topbar', label: 'Top bar' },
  { id: 'rail', label: 'Rail + list' },
  { id: 'command', label: 'Command first' },
  { id: 'twopane', label: 'List + detail' },
  { id: 'bento', label: 'Bento dashboard' },
  { id: 'console', label: 'Console' },
  { id: 'floating', label: 'Floating window' },
] as const

export const INTERFACE_STYLES = [{ id: 'editorial', label: 'Editorial' },{ id: 'soft', label: 'Soft studio' },{ id: 'ink', label: 'Ink & paper' },{ id: 'glass', label: 'Glass studio' }] as const

export const TASTE_QUIZ = [
  {
    "q": "You open OddBrain in the morning. What should it feel like?",
    "options": [
      {
        "label": "A warm notebook left open for me",
        "desc": "Paper, plum, quiet confidence.",
        "w": {
          "warm-editorial": 3,
          "ink-sketchbook": 1
        },
        "why": "you want a warm notebook"
      },
      {
        "label": "A friendly little companion",
        "desc": "Soft shapes, warm colours, gentle movement.",
        "w": {
          "cozy-studio": 3,
          "playful-lab": 1
        },
        "why": "you want a friendly companion"
      },
      {
        "label": "A clean, quiet tool",
        "desc": "Little colour, precise spacing, nothing shouting.",
        "w": {
          "quiet-minimal": 3,
          "terminal-engine": 1
        },
        "why": "you want a clean, quiet tool"
      },
      {
        "label": "A machine that means business",
        "desc": "Monospace, dense, honest status everywhere.",
        "w": {
          "terminal-engine": 3,
          "retro-desktop": 1
        },
        "why": "you want a machine"
      }
    ]
  },
  {
    "q": "How much personality should the little brain have?",
    "options": [
      {
        "label": "A lot — let it be genuinely silly",
        "desc": "Dancing, juggling shoes, cheek wobbles.",
        "w": {
          "playful-lab": 3,
          "retro-desktop": 1
        },
        "why": "you want it silly"
      },
      {
        "label": "Some — it reacts to what is happening",
        "desc": "Thinking, working, done. Nothing extra.",
        "w": {
          "warm-editorial": 2,
          "ink-sketchbook": 2,
          "cozy-studio": 1
        },
        "why": "you want it reactive"
      },
      {
        "label": "Only for real status changes",
        "desc": "Status only. Calm, factual, no performance.",
        "w": {
          "quiet-minimal": 3,
          "terminal-engine": 2
        },
        "why": "you want restraint"
      },
      {
        "label": "Dramatic and cinematic",
        "desc": "Floating, expressive, a big mood.",
        "w": {
          "glass-future": 3,
          "playful-lab": 1
        },
        "why": "you want drama"
      }
    ]
  },
  {
    "q": "How should the screen be filled?",
    "options": [
      {
        "label": "Roomier — let everything breathe",
        "desc": "Larger spacing, fewer things at once.",
        "w": {
          "warm-editorial": 2,
          "cozy-studio": 2,
          "ink-sketchbook": 1
        },
        "why": "you want room to breathe"
      },
      {
        "label": "Compact — more information, less scrolling",
        "desc": "Tighter lists, same type, faster scanning.",
        "w": {
          "quiet-minimal": 3,
          "terminal-engine": 3
        },
        "why": "you want density"
      }
    ]
  },
  {
    "q": "Light or dark?",
    "options": [
      {
        "label": "Light",
        "desc": "Paper and daylight.",
        "w": {
          "warm-editorial": 2,
          "cozy-studio": 2,
          "quiet-minimal": 2,
          "ink-sketchbook": 2
        },
        "why": "you prefer light"
      },
      {
        "label": "Dark",
        "desc": "Evening work, low glow.",
        "w": {
          "glass-future": 3,
          "terminal-engine": 3
        },
        "why": "you prefer dark"
      },
      {
        "label": "Either — I care more about the feel",
        "desc": "Pick for mood, not brightness.",
        "w": {
          "retro-desktop": 2,
          "playful-lab": 2,
          "ink-sketchbook": 1
        },
        "why": "brightness is not the point"
      }
    ]
  },
  {
    "q": "Honestly — what is on your desk?",
    "options": [
      {
        "label": "Notebooks, pens, a plant",
        "desc": "Analog, tactile, unhurried.",
        "w": {
          "ink-sketchbook": 3,
          "cozy-studio": 2
        },
        "why": "your desk is analog"
      },
      {
        "label": "Two monitors and a terminal",
        "desc": "Technical, precise, fast.",
        "w": {
          "terminal-engine": 3,
          "quiet-minimal": 2
        },
        "why": "your desk is technical"
      },
      {
        "label": "An old computer I refuse to throw away",
        "desc": "Tactile controls and nostalgia.",
        "w": {
          "retro-desktop": 3,
          "ink-sketchbook": 1
        },
        "why": "you keep the old computer"
      },
      {
        "label": "Clean layers, late nights",
        "desc": "Crisp and expressive.",
        "w": {
          "glass-future": 3,
          "playful-lab": 1
        },
        "why": "you like neon and glass"
      }
    ]
  }
] as const

export const NEW_SCENE_IDS: readonly string[] = ["mochi-melt","maestro","rain-check","lens-inspector","belly-laugh","shades-drop","bee-bloom","shoe-lasso","branch-merge","hinge-tune","snow-shiver","pan-flip","lotus-float","megaphone","self-hug","flashlight-search"]
