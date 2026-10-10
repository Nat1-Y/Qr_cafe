/** @type {import('tailwindcss').Config} */

// Buna tokens live in src/index.css as HSL triplets.
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;
// Tokens that already carry their own alpha (see index.css).
const alphaToken = (name) => `hsl(var(--${name}))`;

export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: token("border"),
        input: token("input"),
        ring: alphaToken("ring"),
        background: token("background"),
        foreground: token("foreground"),
        body: token("body"),
        "row-hover": token("row-hover"),
        overlay: alphaToken("overlay"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
          hover: token("primary-hover"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          soft: alphaToken("destructive-soft"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        highlight: {
          DEFAULT: token("highlight"),
          foreground: token("highlight-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        paper: {
          DEFAULT: token("paper"),
          foreground: token("paper-foreground"),
        },
        success: {
          DEFAULT: token("success"),
          foreground: token("success-foreground"),
          soft: alphaToken("success-soft"),
        },
        warning: {
          DEFAULT: token("warning"),
          foreground: token("warning-foreground"),
          soft: alphaToken("warning-soft"),
        },
        info: {
          DEFAULT: token("info"),
          foreground: token("info-foreground"),
          soft: alphaToken("info-soft"),
        },
        chart: {
          1: token("chart-1"),
          2: token("chart-2"),
          3: token("chart-3"),
          4: token("chart-4"),
          5: token("chart-5"),
        },
        sidebar: {
          DEFAULT: token("sidebar"),
          foreground: token("sidebar-foreground"),
          muted: token("sidebar-muted"),
          primary: token("sidebar-primary"),
          "primary-foreground": token("sidebar-primary-foreground"),
          accent: token("sidebar-accent"),
          "accent-foreground": token("sidebar-accent-foreground"),
          border: alphaToken("sidebar-border"),
          ring: alphaToken("sidebar-ring"),
        },
      },
      ringColor: {
        DEFAULT: alphaToken("ring"),
      },
      borderRadius: {
        card: "var(--radius)",
        field: "12px",
      },
      boxShadow: {
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        sans: ['"Outfit Variable"', '"Noto Sans Ethiopic Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        title: ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" }],
        section: ["18px", { lineHeight: "26px", fontWeight: "600" }],
        kpi: ["28px", { lineHeight: "34px", letterSpacing: "-0.01em", fontWeight: "600" }],
        base: ["15px", { lineHeight: "22px" }],
        meta: ["13px", { lineHeight: "18px" }],
        eyebrow: ["12px", { lineHeight: "16px", fontWeight: "600" }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'sheet-in': 'sheetIn 0.2s ease-out',
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      keyframes: {
        sheetIn: {
          '0%': { transform: 'translateX(24px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  plugins: [],
}
