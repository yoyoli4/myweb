import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0710',
          800: '#100A1C',
          700: '#150E22',
          600: '#1D1430',
          500: '#2A1D44',
        },
        gold: {
          DEFAULT: '#C9A961',
          bright: '#E3CB8F',
          dim: '#8A7443',
        },
        wisteria: {
          DEFAULT: '#9D7CD8',
          deep: '#6E4FB0',
        },
        mute: '#9E94B8',
        paper: '#ECE6F5',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', 'STSong', 'SimSun', 'serif'],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      letterSpacing: {
        widest2: '0.42em',
      },
    },
  },
  plugins: [],
}

export default config
