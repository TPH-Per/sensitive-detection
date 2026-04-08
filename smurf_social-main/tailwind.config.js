/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          light: 'var(--color-primary-light)',
          gradient: 'var(--color-primary-gradient)',
        },
        sidebar: {
          bg: 'var(--sidebar-bg)',
          item: 'var(--sidebar-item)',
          'item-hover': 'var(--sidebar-item-hover)',
          'item-active': 'var(--sidebar-item-active)',
        },
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
          chat: 'var(--bg-chat)',
          'message-sent': 'var(--bg-message-sent)',
          'message-received': 'var(--bg-message-received)',
          overlay: 'var(--bg-overlay)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          'on-primary': 'var(--text-on-primary)',
        },
        border: {
          light: 'var(--border-light)',
          subtle: 'var(--border-subtle)',
          medium: 'var(--border-medium)',
          dark: 'var(--border-dark)',
          sidebar: 'var(--sidebar-border)',
        },
        divider: 'var(--divider)',
        success: {
          DEFAULT: 'rgb(var(--color-success-rgb) / <alpha-value>)',
          light: 'var(--color-success-light)',
        },
        error: {
          DEFAULT: 'rgb(var(--color-error-rgb) / <alpha-value>)',
          light: 'var(--color-error-light)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
          light: 'var(--color-warning-light)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info-rgb) / <alpha-value>)',
          light: 'var(--color-info-light)',
        },
        status: {
          online: 'var(--status-online)',
          offline: 'var(--status-offline)',
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-primary-r': 'var(--gradient-primary-r)',
      },
      spacing: {
        13: '3.25rem',
        15: '3.75rem',
        18: '4.5rem',
        22: '5.5rem',
        26: '6.5rem',
        30: '7.5rem',
      },
      fontSize: {
        xs: ['var(--font-size-xs)', { lineHeight: 'var(--line-height-normal)' }],
        sm: ['var(--font-size-sm)', { lineHeight: 'var(--line-height-normal)' }],
        base: ['var(--font-size-base)', { lineHeight: 'var(--line-height-normal)' }],
        lg: ['var(--font-size-lg)', { lineHeight: 'var(--line-height-normal)' }],
        xl: ['var(--font-size-xl)', { lineHeight: 'var(--line-height-tight)' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: 'var(--line-height-tight)' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: 'var(--line-height-tight)' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        dropdown: 'var(--shadow-dropdown)',
        accent: 'var(--shadow-accent)',
        'accent-lg': 'var(--shadow-accent-lg)',
      },
      transitionDuration: {
        fast: 'var(--transition-fast)',
        base: 'var(--transition-base)',
        slow: 'var(--transition-slow)',
      },
      transitionTimingFunction: {
        smooth: 'var(--transition-timing)',
      },
      zIndex: {
        header: 'var(--z-header)',
        sticky: 'var(--z-sticky)',
        dropdown: 'var(--z-dropdown)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        dialog: 'var(--z-dialog)',
        toast: 'var(--z-toast)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        highlightFade: {
          '0%': {
            backgroundColor: 'rgba(0, 104, 255, 0.2)',
            boxShadow: '0 0 0 4px rgba(0, 104, 255, 0.3)',
          },
          '100%': {
            backgroundColor: 'transparent',
            boxShadow: '0 0 0 0 rgba(0, 104, 255, 0)',
          },
        },
        cubePulse: {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 15px var(--color-primary-light), inset 0 0 8px var(--color-primary-light)',
          },
          '50%': {
            transform: 'scale(1.3)',
            boxShadow: '0 0 25px var(--color-primary), inset 0 0 12px var(--color-primary)',
          },
        },
        rotateLoader: {
          '0%': { transform: 'rotate(45deg)' },
          '50%': { transform: 'rotate(225deg)' },
          '100%': { transform: 'rotate(405deg)' },
        },
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.3)', opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out forwards',
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'highlight': 'highlightFade 2s ease-out forwards',
        'cube-pulse': 'cubePulse 1.6s ease-in-out infinite',
        'rotate-loader': 'rotateLoader 1.6s ease-in-out infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
