// Original vector artwork, authored for this project. No image API or image model.
// The shared ink treatment makes a collection; every hairstyle is deliberately drawn.
import { mkdir, writeFile } from 'node:fs/promises'
const ink = '#302a3d'
const profiles = [
  {
    id: 'amara',
    bg: '#ffc4ad',
    skin: '#ad704d',
    hair: '#332634',
    shirt: '#7252b2',
    style: 'braids',
    eyes: 'happy',
    jewelry: 'hoops',
  },
  {
    id: 'milo',
    bg: '#c5e7ce',
    skin: '#edb48c',
    hair: '#79503c',
    shirt: '#e9eee2',
    style: 'wave',
    glasses: 'round',
    freckles: true,
  },
  {
    id: 'cleo',
    bg: '#d8c9f3',
    skin: '#f4c8a7',
    hair: '#d56c40',
    shirt: '#315d61',
    style: 'bob',
    eyes: 'side',
    jewelry: 'dots',
  },
  {
    id: 'jasper',
    bg: '#f7d38b',
    skin: '#996040',
    hair: '#302d32',
    shirt: '#bf594b',
    style: 'swoop',
    beard: 'full',
    eyes: 'side',
  },
  {
    id: 'olive',
    bg: '#f6e7a6',
    skin: '#dfac90',
    hair: '#e3dfd6',
    shirt: '#526d5b',
    style: 'bun',
    glasses: 'cat',
    jewelry: 'hoops',
  },
  {
    id: 'theo',
    bg: '#bedfed',
    skin: '#f1c49b',
    hair: '#e7b253',
    shirt: '#e57859',
    style: 'quiff',
    eyes: 'happy',
    freckles: true,
  },
  {
    id: 'zara',
    bg: '#d7c1ee',
    skin: '#80503a',
    hair: '#2d2930',
    shirt: '#efb347',
    style: 'afro',
    jewelry: 'hoops',
  },
  {
    id: 'felix',
    bg: '#b8dac1',
    skin: '#ddb08c',
    hair: '#583a30',
    shirt: '#d7b8d7',
    style: 'part',
    beard: 'stache',
    glasses: 'square',
  },
  {
    id: 'luna',
    bg: '#bbe6de',
    skin: '#f2c7b0',
    hair: '#d4789c',
    shirt: '#7357ad',
    style: 'space',
    eyes: 'happy',
    jewelry: 'stars',
  },
  {
    id: 'nico',
    bg: '#cdd5e9',
    skin: '#c18c66',
    hair: '#45322e',
    shirt: '#e8bb61',
    style: 'beanie',
    eyes: 'side',
  },
  {
    id: 'priya',
    bg: '#f1c7a7',
    skin: '#ae7853',
    hair: '#2c2b35',
    shirt: '#52726b',
    style: 'long',
    jewelry: 'nose',
  },
  {
    id: 'hugo',
    bg: '#d3c3e2',
    skin: '#bd8867',
    hair: '#493329',
    shirt: '#e7d8b4',
    style: 'bald',
    beard: 'handlebar',
    glasses: 'round',
  },
  {
    id: 'iris',
    bg: '#f4cad7',
    skin: '#f1c5a4',
    hair: '#796095',
    shirt: '#365f66',
    style: 'pixie',
    eyes: 'side',
    jewelry: 'dots',
  },
  {
    id: 'oscar',
    bg: '#c9dfb4',
    skin: '#f3c7a2',
    hair: '#b66a3e',
    shirt: '#69778d',
    style: 'curl',
    beard: 'full',
    freckles: true,
  },
  {
    id: 'bea',
    bg: '#c5dfe8',
    skin: '#bd815b',
    hair: '#3c2e31',
    shirt: '#e8a36a',
    style: 'puff',
    glasses: 'sun',
    jewelry: 'hoops',
  },
  {
    id: 'max',
    bg: '#f3c69d',
    skin: '#e0ad83',
    hair: '#634231',
    shirt: '#527d77',
    style: 'cap',
    eyes: 'happy',
  },
  {
    id: 'esme',
    bg: '#e5c9d6',
    skin: '#bd8a63',
    hair: '#665487',
    shirt: '#c77961',
    style: 'hijab',
    eyes: 'happy',
    jewelry: 'dots',
  },
  {
    id: 'leo',
    bg: '#f4df99',
    skin: '#8c573c',
    hair: '#49332a',
    shirt: '#bd6258',
    style: 'locs',
    eyes: 'side',
    jewelry: 'dots',
  },
  {
    id: 'ruby',
    bg: '#c6d9c1',
    skin: '#f6cfb3',
    hair: '#a84b3e',
    shirt: '#5d5c85',
    style: 'fringe',
    glasses: 'cat',
    freckles: true,
  },
  {
    id: 'otto',
    bg: '#d5d7ed',
    skin: '#d8b298',
    hair: '#aaa6a0',
    shirt: '#35576a',
    style: 'part',
    beard: 'short',
    glasses: 'square',
  },
  {
    id: 'mae',
    bg: '#efc4af',
    skin: '#e6b591',
    hair: '#302e38',
    shirt: '#677c58',
    style: 'pony',
    eyes: 'side',
    jewelry: 'stars',
  },
  {
    id: 'ezra',
    bg: '#cedfbc',
    skin: '#bd8b6e',
    hair: '#6b537b',
    shirt: '#e0b35a',
    style: 'curl',
    glasses: 'round',
  },
  {
    id: 'june',
    bg: '#d5c8e8',
    skin: '#f0c9a6',
    hair: '#dfbc70',
    shirt: '#c87167',
    style: 'headband',
    eyes: 'happy',
    jewelry: 'dots',
  },
  {
    id: 'arlo',
    bg: '#bfded6',
    skin: '#dbac89',
    hair: '#795744',
    shirt: '#e6e1ca',
    style: 'shag',
    eyes: 'side',
    freckles: true,
  },
]
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`
const circle = (cx, cy, r, fill, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`
function hair(p, back = false) {
  const h = p.hair
  if (back) {
    const styles = {
      braids: `${path('M44 67Q31 83 39 130L49 139L53 75Z', h)}${path('M115 67Q134 91 122 139L111 135L108 76Z', h)}${[86, 101, 116].map((y) => path(`M37 ${y}l14 8M112 ${y + 4}l13-7`, 'none', 'stroke="#665064"')).join('')}`,
      bob: path('M39 77Q34 31 80 29Q128 29 122 89L124 123Q100 137 80 121Q53 137 35 120Z', h),
      long: path('M39 73Q35 24 80 25Q129 26 122 76L132 153L102 149L78 121L56 151L30 148Z', h),
      afro:
        circle(80, 65, 51, h) +
        circle(39, 70, 22, h) +
        circle(120, 70, 22, h) +
        circle(54, 31, 22, h) +
        circle(100, 29, 24, h),
      space: circle(39, 44, 21, h) + circle(121, 44, 21, h),
      puff: circle(51, 37, 29, h) + circle(106, 36, 28, h),
      pony: path('M114 51Q151 34 146 78Q141 101 119 114L118 79Z', h),
      shag: path('M40 61Q26 89 37 124L53 134L81 119L110 137L128 119Q135 96 120 63Z', h),
      hijab: path('M40 70Q33 27 80 24Q124 26 123 73L135 147Q81 171 25 147Z', h),
      locs: [39, 48, 112, 122]
        .map((x, i) =>
          path(
            `M${x} 56q${i % 2 ? 12 : -12} 31 1 76`,
            'none',
            `stroke="${h}" stroke-width="13" stroke-linecap="round"`,
          ),
        )
        .join(''),
    }
    return styles[p.style] || ''
  }
  const styles = {
    braids:
      path('M43 72Q37 31 80 30Q126 30 117 73L109 66L106 46Q78 37 50 57L50 74Z', h) +
      path('M54 38L52 54M70 33L69 46M87 33L87 46M104 39L102 49', 'none', 'stroke="#665064"'),
    wave: path(
      'M43 74Q22 60 40 43Q27 25 53 29Q64 9 80 28Q110 9 114 33Q141 39 119 68L110 75L105 52Q77 66 55 53L49 77Z',
      h,
    ),
    bob: path('M41 76Q33 33 80 29Q128 30 119 78L109 74L105 51Q76 70 47 57L48 79Z', h),
    swoop: path('M43 75L40 51Q43 27 65 34Q96 8 119 39L116 76L106 69L104 51Q66 61 52 52L51 77Z', h),
    bun:
      circle(79, 28, 19, h) +
      path('M42 72Q36 38 76 35Q119 34 119 74L111 75L106 49Q78 67 50 55L50 77Z', h),
    quiff: path(
      'M43 74L39 49Q39 32 53 34Q56 9 85 20Q119 14 122 36Q126 54 116 73L107 68L106 47Q75 58 52 48L50 75Z',
      h,
    ),
    afro: path(
      'M43 77Q36 44 57 46Q62 31 80 44Q99 30 106 48Q128 43 117 77L109 72L105 56Q77 65 54 55L51 78Z',
      h,
    ),
    part:
      path('M43 78Q34 47 49 39Q76 18 107 34Q126 41 117 78L108 70L104 48Q79 62 51 51L50 79Z', h) +
      path('M85 33L73 51', 'none', 'stroke="#bd9b7e" stroke-width="3"'),
    space: path('M43 73Q40 31 79 31Q120 30 117 74L109 74L105 51Q92 61 80 43Q70 62 51 53L51 75Z', h),
    beanie:
      path('M36 59Q36 18 78 19Q124 17 125 63L119 78L108 69L105 54L52 54L48 77L40 76Z', h) +
      path('M35 56Q80 47 126 57L126 72Q82 62 35 72Z', '#657c76') +
      path(
        'M49 30L47 53M65 25L64 51M82 24L82 50M99 27L100 52M114 34L116 54',
        'none',
        'stroke="#87988e" stroke-width="2"',
      ),
    long:
      path('M42 79Q36 29 80 26Q125 26 119 79L109 76L103 47Q78 67 51 60L50 81Z', h) +
      path('M81 30L73 46', 'none', 'stroke="#5f5260"'),
    bald: path('M44 68Q34 76 45 86L51 81L51 66ZM116 68Q128 76 115 86L108 81L109 66Z', h),
    pixie: path(
      'M43 79Q33 53 45 44Q38 21 65 29Q88 12 112 33L124 30L119 44L130 47L115 59L114 78L105 67L103 50Q77 69 53 57L51 78Z',
      h,
    ),
    curl: [
      [43, 56, 14],
      [51, 39, 14],
      [72, 34, 16],
      [92, 34, 16],
      [111, 42, 15],
      [118, 60, 11],
    ]
      .map(([x, y, r]) => circle(x, y, r, h))
      .join(''),
    puff: path('M44 74Q34 41 57 42Q78 28 100 42Q125 43 117 75L109 75L105 52Q80 65 53 54L51 77Z', h),
    cap:
      path('M39 60Q39 24 80 23Q117 23 121 59L109 76L105 56L52 56L49 77L41 75Z', h) +
      path('M36 57Q38 22 79 23Q113 23 119 56Z', '#6876a3') +
      path('M36 57Q81 44 135 59Q144 67 131 69L97 63L35 65Z', '#4e6089') +
      path('M79 27L78 48', 'none', 'stroke="#98a4c1"'),
    hijab:
      path('M39 73Q33 25 81 25Q130 25 122 80L112 94L107 62Q82 65 59 46Q51 64 49 89Z', h) +
      path(
        'M112 91Q99 117 61 125L43 150L119 151L130 136Q91 142 65 130',
        'none',
        'stroke="#a291ba" stroke-width="3"',
      ),
    locs: [
      [49, 37, 62, 50],
      [62, 28, 76, 48],
      [79, 25, 88, 47],
      [96, 29, 101, 48],
      [111, 40, 114, 67],
    ]
      .map(([x, y, x2, y2]) =>
        path(
          `M${x} ${y}Q${x - 8} ${y + 17} ${x2} ${y2}`,
          'none',
          `stroke="${h}" stroke-width="14" stroke-linecap="round"`,
        ),
      )
      .join(''),
    fringe: path(
      'M42 76Q31 29 79 28Q128 28 119 78L109 76L108 54L98 60L89 53L79 60L69 54L60 61L51 55L50 78Z',
      h,
    ),
    pony:
      path('M43 76Q32 32 78 29Q120 26 119 76L110 72L105 49Q75 65 52 58L51 78Z', h) +
      path('M115 48L123 56', 'none', 'stroke="#f0ba64" stroke-width="7"'),
    headband:
      path('M42 77Q32 28 80 29Q129 30 119 79L109 77L106 54Q76 68 51 55L50 79Z', h) +
      path('M46 48Q78 25 115 47', 'none', 'stroke="#9c668c" stroke-width="9"'),
    shag: path(
      'M41 83Q24 49 45 37Q54 20 79 28Q109 17 122 43L132 54L118 61L122 80L111 79L106 53Q85 70 57 58L51 82Z',
      h,
    ),
  }
  return styles[p.style] || ''
}
function glasses(type) {
  const color = type === 'cat' ? '#fff6df' : ink
  const attrs = `fill="${type === 'sun' ? ink : 'none'}" stroke="${color}" stroke-width="4"`
  if (type === 'round')
    return `<g ${attrs}><circle cx="61" cy="83" r="14"/><circle cx="99" cy="83" r="14"/><path d="M75 81q5-4 10 0M40 79l7 2M113 81l7-2"/></g>`
  if (type === 'cat')
    return `<g ${attrs}><path d="M43 74L75 77L74 89Q58 102 47 87ZM117 74L85 77L86 89Q102 102 113 87Z"/><path d="M75 81q5-4 10 0"/></g>`
  return `<g ${attrs}><rect x="44" y="74" width="31" height="23" rx="6"/><rect x="85" y="74" width="31" height="23" rx="6"/><path d="M75 80h10M38 78l6 3M116 81l6-3"/></g>`
}
function draw(p) {
  const face =
    p.id === 'hugo'
      ? 'M46 68Q47 36 80 36Q114 36 114 68L112 95Q109 123 80 126Q51 123 48 95Z'
      : p.id === 'jasper' || p.id === 'otto'
        ? 'M44 65Q43 36 80 35Q118 35 116 66L114 103Q106 127 80 128Q52 124 46 102Z'
        : 'M44 65Q44 35 80 35Q116 35 116 65L113 96Q110 124 80 127Q51 124 47 96Z'
  const beard =
    p.beard === 'full'
      ? path('M48 92L58 104Q79 93 102 104L113 91L111 110Q100 135 80 134Q59 132 49 111Z', p.hair) +
        path('M68 114Q80 120 92 114', 'none', 'stroke="#f0b593" stroke-width="3"')
      : p.beard === 'short'
        ? path('M49 98Q55 114 65 109Q80 104 95 109Q106 112 112 98L110 114Q80 143 51 114Z', p.hair)
        : p.beard
          ? path(
              'M79 98Q65 90 59 100L52 105Q66 111 80 104Q97 112 109 103L100 103Q94 90 81 98Z',
              p.hair,
            )
          : ''
  const eyes =
    p.eyes === 'happy'
      ? path('M55 82q6-8 12 0M93 82q6-8 12 0', 'none', 'stroke-width="3.5"')
      : circle(p.eyes === 'side' ? 63 : 61, 82, 3.5, ink) +
        circle(p.eyes === 'side' ? 101 : 99, 82, 3.5, ink)
  const jewelry =
    p.jewelry === 'hoops'
      ? `<g fill="none" stroke="#e6b451" stroke-width="4"><ellipse cx="43" cy="99" rx="7" ry="10"/><ellipse cx="117" cy="99" rx="7" ry="10"/></g>`
      : p.jewelry === 'dots'
        ? circle(44, 96, 4, '#e9c15e') + circle(117, 96, 4, '#e9c15e')
        : p.jewelry === 'stars'
          ? path('M43 91l2 5 6 1-5 4 1 6-5-3-5 3 1-6-4-4 6-1Z', '#f2c65f')
          : p.jewelry === 'nose'
            ? `<circle cx="87" cy="95" r="4" fill="none" stroke="#edbf66" stroke-width="2"/>`
            : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180"><title>${p.id[0].toUpperCase() + p.id.slice(1)} — original illustrated character</title><rect width="160" height="180" fill="${p.bg}"/><circle cx="130" cy="26" r="38" fill="#fff8eb" opacity=".18"/><g stroke="${ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${hair(p, true)}${path('M16 184L23 150Q29 137 62 132L98 132Q134 137 140 150L147 184Z', p.shirt)}${path('M65 119L64 137Q79 153 96 137L94 118Z', p.skin)}${path('M64 136L78 151L62 160L52 137M96 136L80 151L98 160L108 137', p.shirt)}${circle(44, 83, 9, p.skin)}${circle(116, 83, 9, p.skin)}${path(face, p.skin)}${hair(p)}${path('M54 69q8-4 15 0M91 69q8-4 15 0', 'none', 'opacity=".8"')}${eyes}${path('M80 84l-4 12h7', 'none', 'stroke-width="2" opacity=".55"')}${
    p.freckles
      ? [
          [54, 94],
          [60, 96],
          [64, 93],
          [97, 94],
          [103, 96],
          [108, 93],
        ]
          .map(([x, y]) => circle(x, y, 1.3, '#a76c50', 'stroke="none"'))
          .join('')
      : ''
  }${circle(57, 97, 7, '#d67970', 'stroke="none" opacity=".22"')}${circle(103, 97, 7, '#d67970', 'stroke="none" opacity=".22"')}${beard}${!p.beard || p.beard === 'short' ? path(p.eyes === 'happy' ? 'M68 108Q80 121 92 108Z' : 'M70 110q10 7 20-1', p.eyes === 'happy' ? '#fff8eb' : 'none', 'stroke-width="2.5"') : ''}${p.glasses ? glasses(p.glasses) : ''}${jewelry}${path('M34 161L32 180M127 161l2 19', 'none', 'opacity=".45"')}${p.id === 'milo' || p.id === 'arlo' ? path('M79 152L80 180', 'none') + circle(85, 166, 1.5, ink) : ''}</g></svg>`
}
await mkdir(new URL('../public/characters/', import.meta.url), { recursive: true })
await Promise.all(
  profiles.map((p) =>
    writeFile(new URL(`../public/characters/${p.id}.svg`, import.meta.url), draw(p)),
  ),
)
console.log(`Wrote ${profiles.length} original SVG portraits.`)
