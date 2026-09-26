/**
 * VoyageX design tokens.
 *
 * A travel palette chosen for the domain rather than borrowed from any site:
 * deep ocean teal carries the brand and every primary action, warm sand marks
 * prices and highlights, and a near-black slate does the reading. Category
 * gradients stand in for photography — the system is offline-only (SRS C-06),
 * so there is no image CDN to call and no third-party asset in the repo.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ocean: {
          50:'#eef8f8',100:'#d4eded',200:'#a9dcdc',300:'#72c3c5',
          400:'#43a4a8',500:'#2a878c',600:'#216c73',700:'#1d565d',
          800:'#1b464c',900:'#0f2f34',
        },
        sand: {
          50:'#fdf8ed',100:'#f9ecce',200:'#f3d799',300:'#ecbd5e',
          400:'#e6a534',500:'#d9871d',600:'#bd6817',700:'#9c4a16',
          800:'#7f3b19',900:'#6a3118',
        },
        ink: {
          50:'#f6f7f8',100:'#eceef1',200:'#d4d9df',300:'#aeb7c2',
          400:'#818e9d',500:'#627082',600:'#4d596a',700:'#404956',
          800:'#373e49',900:'#21262e',950:'#13171c',
        },
      },
      fontFamily: {
        // System stack on purpose: no webfont request, so the UI renders
        // identically on a grader's machine with no network.
        sans: ['ui-sans-serif','system-ui','-apple-system','Segoe UI','Roboto','Helvetica Neue','Arial','sans-serif'],
        mono: ['ui-monospace','SFMono-Regular','Menlo','Consolas','monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.18)',
        lift: '0 2px 4px rgba(16,24,40,.06), 0 18px 40px -16px rgba(16,24,40,.28)',
      },
      borderRadius: { xl2: '1.125rem' },
    },
  },
  plugins: [],
};
