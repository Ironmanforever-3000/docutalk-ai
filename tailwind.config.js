/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			gray: {
  				'850': '#1f2937',
  				'950': '#030712'
  			},
  			ink: {
  				'700': '#2A2E33',
  				'800': '#1D2024',
  				'900': '#14161A',
  				'950': '#0B0D10',
  				DEFAULT: '#0B0D10'
  			},
  			ember: {
  				'400': '#FF8F63',
  				'500': '#FF6A3D',
  				'600': '#E8501E',
  				'700': '#C73E1D',
  				DEFAULT: '#FF6A3D'
  			},
  			parchment: {
  				'300': '#D9D2C6',
  				DEFAULT: '#F3EDE4'
  			},
  			ash: '#8B8680',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: 'hsl(var(--destructive))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			display: [
  				'"Fraunces"',
  				'Georgia',
  				'serif'
  			],
  			sans: [
  				'"IBM Plex Sans"',
  				'system-ui',
  				'sans-serif'
  			],
  			mono: [
  				'"IBM Plex Mono"',
  				'"Fira Code"',
  				'monospace'
  			]
  		},
  		keyframes: {
  			'draw-in': {
  				from: {
  					strokeDashoffset: '1'
  				},
  				to: {
  					strokeDashoffset: '0'
  				}
  			},
  			'fade-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(16px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			blink: {
  				'0%, 100%': {
  					opacity: '1'
  				},
  				'50%': {
  					opacity: '0'
  				}
  			},
  			'typing-dot': {
  				'0%, 80%, 100%': {
  					transform: 'scale(0.6)',
  					opacity: '0.4'
  				},
  				'40%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			'logo-roll': {
  				'0%': {
  					transform: 'translateX(0) rotate(0deg)'
  				},
  				'100%': {
  					transform: 'translateX(var(--roll-distance)) rotate(360deg)'
  				}
  			},
  			'progress-fill': {
  				from: {
  					width: '0%'
  				},
  				to: {
  					width: '100%'
  				}
  			},
  			shimmer: {
  				from: {
  					backgroundPosition: '200% center'
  				},
  				to: {
  					backgroundPosition: '-200% center'
  				}
  			}
  		},
  		animation: {
  			'fade-up': 'fade-up 0.5s ease both',
  			blink: 'blink 1s step-end infinite',
  			'typing-dot': 'typing-dot 1.4s ease-in-out infinite',
  			shimmer: 'shimmer 3s linear infinite'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [
    require('@tailwindcss/typography'),
      require("tailwindcss-animate")
],
}
