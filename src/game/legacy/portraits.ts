export interface PortraitTraits {
  face: number
  nose: number
  eyes: number
  brows: number
  mouth: number
  hair: number
  hat: number
  outfit: number
  glasses: number
  beard: number
  earrings: number
  detail: number
  skin: number
  hairColor: number
  eyeColor: number
  fabric: number
  accent: number
  feminine: boolean
}
export const SKINS = [
  '#ffdbbd',
  '#edbd98',
  '#d69b70',
  '#bf8156',
  '#a86945',
  '#8c583d',
  '#71432f',
  '#583626',
  '#e7b59d',
  '#bd8d74',
]
export const HAIR_COLORS = [
  '#282337',
  '#51362f',
  '#79513c',
  '#a96a3f',
  '#d69848',
  '#f0d38d',
  '#e4dfd8',
  '#858a9a',
  '#bc4d44',
  '#dc83aa',
  '#885cc5',
  '#426c9d',
  '#4d8c7c',
  '#d1b0d9',
  '#6d2948',
  '#ae754f',
]
export const EYE_COLORS = [
  '#754b32',
  '#302e3b',
  '#b57b34',
  '#819456',
  '#3d826f',
  '#5085b8',
  '#8995a7',
  '#b18c53',
]
export const FABRICS = [
  '#e46a51',
  '#7152b0',
  '#388779',
  '#e8b645',
  '#5386b0',
  '#c7648c',
  '#355d62',
  '#a86338',
  '#87944b',
  '#ed9d77',
  '#6b74b8',
  '#d09bbb',
  '#a8c8b1',
  '#f4e8c8',
  '#595466',
  '#95bed1',
]
export const BACKGROUNDS = ['#f8d6b8', '#d4e6cb', '#e3d7f2', '#f5e3a9', '#d0e6ed', '#f3d4df']
export const PART_COUNTS = {
  face: 8,
  nose: 8,
  eyes: 8,
  brows: 6,
  mouth: 8,
  hair: 20,
  hat: 8,
  outfit: 12,
  glasses: 8,
  beard: 8,
  earrings: 8,
  detail: 8,
} as const
export const NAMES = [
  'Amara',
  'Milo',
  'Cleo',
  'Jasper',
  'Olive',
  'Theo',
  'Zara',
  'Felix',
  'Luna',
  'Nico',
  'Priya',
  'Hugo',
  'Iris',
  'Oscar',
  'Bea',
  'Max',
  'Esme',
  'Leo',
  'Ruby',
  'Otto',
  'Mae',
  'Ezra',
  'June',
  'Arlo',
]
export function traitsFor(seed: number, index: number): PortraitTraits {
  const i = (index * 5 + (seed % 24)) % 24
  const pick = (salt: number, n: number) => {
    const x = BigInt(
      (((seed + (i + 1) * 104729 + salt * 15485863) % 2147483647) * 48271) % 2147483647,
    )
    return Number(((x * x) % 2147483647n) % BigInt(n))
  }
  const feminine = index % 2 === 0
  return {
    face: (i + seed) % 8,
    nose: (i * 3 + Math.floor(i / 8) + seed) % 8,
    eyes: (i * 5 + Math.floor(i / 6) + seed) % 8,
    brows: pick(4, 6),
    mouth: pick(5, 8),
    hair: (i + seed) % 20,
    hat: i % 4 === 0 ? pick(7, 8) : -1,
    outfit: (i + seed) % 12,
    glasses: i % 3 === 0 ? pick(9, 8) : -1,
    beard: !feminine && i % 3 !== 0 ? pick(10, 8) : -1,
    earrings: feminine && i % 5 !== 0 ? pick(11, 8) : -1,
    detail: pick(12, 8),
    skin: (i * 3 + Math.floor(i / 10) + seed) % 10,
    hairColor: pick(14, 16),
    eyeColor: (i + seed) % 8,
    fabric: pick(16, 16),
    accent: pick(17, 16),
    feminine,
  }
}
const path = (d: string, fill: string, more = '') => `<path d="${d}" fill="${fill}" ${more}/>`
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, more = '') =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${more}/>`
const faceShapes = [
  'M43 57Q42 23 80 24Q120 25 118 59L114 96Q110 124 80 130Q49 122 45 98Z',
  'M38 66Q35 28 80 28Q126 29 122 67Q125 112 80 125Q34 111 38 66Z',
  'M48 56Q47 23 80 23Q113 23 112 56L110 107L97 131L65 131L50 111Z',
  'M39 54Q42 26 80 27Q119 26 121 54L116 108Q106 128 80 129Q52 128 43 109Z',
  'M44 55Q38 22 80 23Q121 22 116 56L108 100Q93 118 80 135Q65 119 52 101Z',
  'M42 61Q37 29 80 26Q125 29 118 61L116 93Q134 114 103 123Q81 138 58 122Q25 112 44 91Z',
  'M49 55Q46 20 80 20Q113 20 111 55L109 110Q107 139 80 141Q52 139 51 111Z',
  'M36 63Q32 33 80 32Q128 33 124 63L120 104Q112 120 80 120Q47 120 40 104Z',
]
const hairs = [
  'M39 67Q29 28 55 28Q61 5 83 26Q115 7 125 38L120 75L109 64L103 49Q80 65 53 49L49 72Z',
  'M38 65Q28 22 80 19Q134 25 121 73L107 67L103 43Q83 53 48 43L49 75Z',
  'M34 85L32 46Q38 15 81 19Q127 16 128 49L125 107L111 99L109 46L49 46L47 105L33 108Z',
  'M43 64Q23 40 47 31Q37 8 66 19Q76 2 96 19Q129 9 121 39Q142 49 116 71L106 49L52 49Z',
  'M39 65Q35 17 80 17Q126 17 121 65L109 60L104 38L55 39L49 66Z',
  'M34 87Q21 52 42 35Q43 10 77 16Q113 5 128 36L140 51L120 59L125 85L107 65L103 43L50 48L51 83Z',
  'M40 62Q30 19 74 20Q119 8 125 39Q130 51 114 70L102 47Q72 65 48 50L49 73Z',
  'M34 74L34 43Q35 15 80 16Q126 15 126 44L124 75L112 68L108 47L98 58L89 46L79 58L68 46L58 58L49 46L48 76Z',
  'M43 60Q32 34 55 25Q62 11 82 20Q98 9 113 28Q132 39 119 65L106 53L104 40L52 39L50 66Z',
  'M42 71Q39 32 80 30Q121 30 118 70L108 66L105 47Q74 56 50 49L49 75Z',
  'M40 68Q27 26 70 19Q93 -3 120 23Q136 43 116 70L105 52Q82 41 51 46L48 74Z',
  'M43 74L40 41Q50 19 80 20Q119 17 120 51L113 73L102 55L100 38Q68 41 51 61L50 81Z',
  'M43 73L43 48Q45 30 58 29L58 41L102 41L102 28Q119 32 118 53L113 75L105 68L105 47L51 47L50 77Z',
  'M41 74Q38 23 80 25Q123 23 119 74L109 69L108 45L98 36L88 49L79 35L69 49L57 37L50 53L50 76Z',
  'M44 69Q36 35 58 29Q75 19 107 31L119 53L112 73L102 47L92 32L84 48L68 34L52 51L50 76Z',
  'M40 76Q30 33 53 23L70 16L76 30L93 13L102 32L123 29L116 49L129 54L112 66L108 48L51 48L49 78Z',
  'M40 78Q30 27 80 23Q128 24 120 78L110 72L103 44Q84 71 48 55L49 81Z',
  'M43 76Q35 28 80 24Q126 28 117 76L108 68L104 43L55 43L50 79Z',
  'M43 76Q33 24 80 22Q127 24 117 76L107 68L106 43L55 43L49 78Z',
  'M41 77Q24 30 80 19Q137 32 119 77L108 73L105 49Q75 39 53 57L50 81Z',
]
const noses = [
  'M80 72L73 94L85 95',
  'M78 75Q92 94 76 96',
  'M79 77L68 96L86 98',
  'M79 79Q66 98 81 100Q95 99 84 87',
  'M82 74L83 98L72 96',
  'M80 81Q71 92 76 96Q89 100 91 91',
  'M80 78L75 90Q65 96 77 99L88 96',
  'M78 76Q83 85 76 89Q68 98 88 96',
]
const mouths = [
  'M67 108Q80 121 96 107',
  'M65 108Q81 131 97 108Z',
  'M69 110L93 108',
  'M72 112Q81 104 93 112',
  'M66 109Q80 117 96 106',
  'M73 107Q83 100 91 108Q85 120 73 107Z',
  'M65 108Q73 112 81 110Q88 114 96 108',
  'M67 108Q79 124 95 108L93 117Q80 127 69 117Z',
]
/** Authored vector parts only; no remote images or markup from user input. */
export function portraitSvg(t: PortraitTraits, name = 'Character'): string {
  const ink = '#302640',
    skin = SKINS[t.skin]!,
    hair = HAIR_COLORS[t.hairColor]!,
    fabric = FABRICS[t.fabric]!,
    accent = FABRICS[t.accent]!
  const face = faceShapes[t.face]!,
    h = hairs[t.hair]!
  const long = [2, 7, 16, 17, 18, 19].includes(t.hair)
  let back = long
    ? path('M36 57Q29 17 80 15Q131 17 125 58L137 156L103 148L80 126L54 151L24 154Z', hair)
    : ''
  if (t.hair === 3)
    back = [
      [-5, 0],
      [0, -10],
      [12, -12],
      [25, 0],
      [16, 15],
    ]
      .map(([x, y]) => ellipse(68 + x!, 45 + y!, 38, 34, hair))
      .join('')
  if (t.hair === 9) back = ellipse(80, 21, 23, 19, hair)
  if (t.hair === 17) back = ellipse(126, 61, 21, 36, hair)
  if (t.hair === 18) back = ellipse(36, 38, 23, 24, hair) + ellipse(124, 38, 23, 24, hair)
  let shirt = path('M15 195L17 158Q22 140 59 135L101 135Q138 139 144 158L148 195Z', fabric)
  const collars = [
    path('M57 136L80 157L103 136L111 144L97 165L80 157L64 165L49 144Z', accent),
    path('M58 135Q80 162 102 135L108 141Q80 173 51 142Z', accent),
    path('M54 133L106 133L109 150Q78 161 51 149Z', fabric),
    path('M52 136L65 135L80 175L95 135L108 136L97 194L61 194Z', accent),
    path('M57 137L68 136L81 159L94 136L104 137L97 181L65 181Z', accent),
    path('M58 136L70 148L80 139L90 148L102 136L100 156L81 146L60 158Z', accent),
    path('M47 142L55 138L65 195L51 195ZM107 137L116 142L111 195L97 195Z', accent),
    path('M57 137Q80 168 103 137', 'none', 'stroke-width="9" stroke="' + accent + '"'),
    path('M48 145Q78 165 112 145L117 151Q80 179 43 153Z', accent),
    path('M57 136L71 134L80 158L88 134L102 136L94 160L66 160Z', accent),
    path('M26 166L137 166L140 177L23 177Z', accent),
    path('M57 137L80 160L103 137L110 144L80 176L49 144Z', accent),
  ]
  shirt += collars[t.outfit]
  if (t.outfit === 4) shirt += path('M73 145L87 145L92 181L80 191L68 181Z', accent)
  if (t.outfit === 5) shirt += ellipse(77, 170, 2, 2, ink) + ellipse(77, 181, 2, 2, ink)
  if (t.outfit === 9) shirt += path('M79 159L79 194', 'none')
  if (t.outfit === 11) shirt += ellipse(109, 175, 7, 7, '#f6d267', 'stroke="none"')
  const neck = path('M65 112L63 138Q79 157 98 138L96 111Z', skin)
  const eyeY = [72, 72, 70, 72, 71, 74, 74, 70][t.face]!
  let eyes = ''
  for (const x of [60, 100]) {
    const ry = [6, 9, 5, 7, 6, 4, 8, 6][t.eyes]!
    const rx = [10, 8, 11, 10, 8, 12, 9, 11][t.eyes]!
    eyes +=
      ellipse(x, eyeY, rx, ry, '#fffaf0') +
      ellipse(
        x + (t.eyes === 5 ? 2 : 0),
        eyeY,
        4.5,
        Math.min(ry, 5),
        EYE_COLORS[t.eyeColor]!,
        'stroke="none"',
      ) +
      ellipse(x + 1, eyeY, 2.3, 3, ink, 'stroke="none"') +
      ellipse(x + 2, eyeY - 2, 1.3, 1.5, 'white', 'stroke="none"')
    if (t.eyes === 2 || t.eyes === 7)
      eyes += path(`M${x - rx} ${eyeY}q${rx} ${-ry * 2} ${rx * 2} 0`, 'none', 'stroke-width="3"')
    const tilt = [-3, 2, 0, -5, 4, -1][t.brows]!
    eyes += path(
      `M${x - 10} ${eyeY - 13}q10 ${tilt - 4} 20 ${tilt}`,
      'none',
      `stroke="${hair}" stroke-width="${t.brows === 2 ? 5 : 3}"`,
    )
  }
  let detail = ''
  if (t.detail === 0)
    detail = [
      [52, 88],
      [58, 91],
      [49, 94],
      [64, 88],
      [101, 89],
      [108, 93],
      [99, 94],
      [113, 88],
    ]
      .map(([x, y]) => ellipse(x!, y!, 1.3, 1.1, '#92543c', 'stroke="none"'))
      .join('')
  if (t.detail === 1) detail = ellipse(104, 101, 2.2, 2.2, ink, 'stroke="none"')
  if (t.detail === 2)
    detail =
      ellipse(54, 94, 9, 5, '#d9647a', 'opacity=".4" stroke="none"') +
      ellipse(106, 94, 9, 5, '#d9647a', 'opacity=".4" stroke="none"')
  if (t.detail === 3)
    detail = path(
      'M56 48L63 57M57 52L61 50M60 56L64 54',
      'none',
      'stroke="#a87764" stroke-width="1.5"',
    )
  if (t.detail === 4)
    detail = path(
      'M47 81Q63 82 56 98Q48 110 44 95ZM95 110Q103 99 112 107L107 119L96 122Z',
      '#f4d4b6',
      'stroke="none"',
    )
  if (t.detail === 5)
    detail = path(
      'M56 51Q78 45 102 51M58 57Q81 52 100 57M45 76L39 74M115 76L122 74M61 107L57 114M101 107L105 114',
      'none',
      'opacity=".45" stroke-width="1.5"',
    )
  if (t.detail === 6)
    detail =
      ellipse(51, 101, 3, 2, '#b97968', 'stroke="none"') +
      ellipse(109, 96, 2, 2, '#b97968', 'stroke="none"')
  if (t.detail === 7)
    detail = path('M59 106q-5 4 0 7M105 106q5 4 0 7', 'none', 'opacity=".4" stroke-width="1.5"')
  let beard = ''
  if (t.beard >= 0) {
    const beards = [
      'M51 94Q64 113 80 109Q97 112 112 94L107 122Q80 145 53 120Z',
      'M59 115Q80 126 102 114L96 134L65 134Z',
      'M65 101Q73 92 81 102Q90 93 99 102L97 109Q88 112 81 105Q70 114 62 108Z',
      'M70 119L94 118L91 137L76 137Z',
      'M46 87L54 92L58 113L50 108ZM107 91L116 87L112 109L104 114Z',
      'M52 103Q80 130 108 102L103 122Q81 138 57 120Z',
      'M65 102Q73 94 81 103Q90 93 98 102L96 107L83 106L83 125L75 125L75 106L64 108Z',
      'M48 94L55 99L61 116L75 120L80 128L85 120L101 116L108 98L113 93L109 123L95 136L66 136L51 122Z',
    ]
    beard = path(beards[t.beard]!, hair, 'stroke-width="1.5"')
  }
  let glasses = ''
  if (t.glasses >= 0) {
    const frame = t.glasses % 2 === 0 ? accent : ink
    const rs = [11, 12, 13, 10, 12, 13, 11, 12][t.glasses]!
    glasses = path(
      `M${60 + rs} ${eyeY}Q80 ${eyeY - 5} ${100 - rs} ${eyeY}M${60 - rs} ${eyeY - 2}L43 ${eyeY - 5}M${100 + rs} ${eyeY - 2}L118 ${eyeY - 5}`,
      'none',
      `stroke="${frame}"`,
    )
    for (const x of [60, 100]) {
      const more = `stroke="${frame}" stroke-width="3"`
      const shapes = [
        ellipse(x, eyeY, 11, 11, 'none', more),
        `<rect x="${x - 12}" y="${eyeY - 10}" width="24" height="21" rx="2" fill="none" ${more}/>`,
        ellipse(x, eyeY, 13, 8, 'none', more),
        path(
          `M${x - 13} ${eyeY - 12}L${x + 13} ${eyeY - 7}L${x + 10} ${eyeY + 10}Q${x} ${eyeY + 15} ${x - 10} ${eyeY + 7}Z`,
          'none',
          more,
        ),
        path(
          `M${x - 13} ${eyeY - 8}Q${x} ${eyeY - 13} ${x + 13} ${eyeY - 8}L${x + 10} ${eyeY + 7}Q${x + 3} ${eyeY + 18} ${x - 7} ${eyeY + 8}Z`,
          'none',
          more,
        ),
        path(
          `M${x - 12} ${eyeY - 8}L${x + 12} ${eyeY - 8}M${x - 12} ${eyeY - 8}Q${x - 14} ${eyeY + 11} ${x} ${eyeY + 11}Q${x + 14} ${eyeY + 11} ${x + 12} ${eyeY - 8}`,
          'none',
          more,
        ),
        path(
          `M${x - 6} ${eyeY - 12}L${x + 6} ${eyeY - 12}L${x + 12} ${eyeY - 5}L${x + 12} ${eyeY + 5}L${x + 6} ${eyeY + 12}L${x - 6} ${eyeY + 12}L${x - 12} ${eyeY + 5}L${x - 12} ${eyeY - 5}Z`,
          'none',
          more,
        ),
        `<rect x="${x - 14}" y="${eyeY - 10}" width="28" height="22" rx="5" fill="#51486b99" ${more}/>`,
      ]
      glasses += shapes[t.glasses]
    }
  }
  let jewelry = ''
  if (t.earrings >= 0)
    for (const x of [39, 121]) {
      const gold = t.earrings % 2 === 0 ? '#e6b64b' : '#ced2e2'
      const pieces = [
        ellipse(x, 93, 4, 7, 'none', `stroke="${gold}" stroke-width="3"`),
        ellipse(x, 97, 7, 12, 'none', `stroke="${gold}" stroke-width="3"`),
        ellipse(x, 89, 4, 4, gold),
        ellipse(x, 88, 2, 2, gold) + ellipse(x, 94, 3.5, 3.5, gold),
        path(`M${x} 87Q${x + 10} 101 ${x} 107Q${x - 10} 101 ${x} 87Z`, gold),
        path(`M${x} 87L${x + 5} 105L${x - 5} 105Z`, gold),
        path(
          `M${x} 87L${x + 3} 93L${x + 7} 94L${x + 3} 98L${x} 105L${x - 3} 98L${x - 7} 94L${x - 3} 93Z`,
          gold,
        ),
        path(`M${x} 88L${x} 106`, 'none', `stroke="${gold}"`) +
          ellipse(x, 91, 2.5, 2.5, gold) +
          ellipse(x, 99, 3, 3, gold) +
          ellipse(x, 107, 3.5, 3.5, gold),
      ]
      jewelry += pieces[t.earrings]
    }
  let hat = ''
  if (t.hat >= 0) {
    const hats = [
      path('M34 49Q35 6 80 10Q126 8 127 49L122 61L37 61Z', accent) +
        path('M32 48L129 48L129 62L32 62Z', fabric),
      path('M38 49Q38 13 80 13Q122 13 122 49Z', accent) +
        path('M32 48Q80 35 140 50L143 58L32 58Z', fabric),
      path('M40 42L49 11L109 11L121 42Z', accent) +
        path('M21 43Q80 31 140 43L138 54L23 54Z', fabric),
      path('M35 49Q39 17 80 15Q121 18 125 49L134 62Q83 52 24 62Z', fabric),
      path('M32 46Q34 18 80 16Q126 18 128 46L115 53L44 53Z', accent) +
        ellipse(105, 15, 4, 4, fabric),
      path('M45 46L48 10L113 10L117 46Z', fabric) + path('M29 45L134 45L134 55L29 55Z', accent),
      path('M38 55Q35 12 80 12Q128 13 123 57L107 60L104 33L55 34L51 61Z', accent) +
        ellipse(80, 9, 10, 9, fabric),
      path('M40 42L42 20L58 34L72 13L88 35L108 19L119 43L116 53L43 53Z', '#edc75d') +
        ellipse(80, 40, 4, 5, accent),
    ]
    hat = hats[t.hat]!
  }
  const escaped = name.replace(/[<>&"']/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 190" role="img"><title>${escaped}</title><defs><linearGradient id="wash" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><path fill="url(#wash)" d="M0 0H160V190H0Z"/><g stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${back}${shirt}${neck}${ellipse(41, 81, 8, 12, skin)}${ellipse(119, 81, 8, 12, skin)}${path(face, skin)}${detail}${eyes}${path(noses[t.nose]!, 'none', 'stroke="#8d5b48" stroke-width="2.3"')}${beard}${path(mouths[t.mouth]!, t.mouth === 1 || t.mouth === 7 ? '#fff9ef' : t.mouth === 5 ? '#9e4c57' : 'none', 'stroke-width="2.2"')}${path(h, hair)}${glasses}${jewelry}${hat}</g></svg>`
}
