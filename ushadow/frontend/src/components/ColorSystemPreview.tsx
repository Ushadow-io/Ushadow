/**
 * ColorSystemPreview - Visual preview of the Ushadow design system
 *
 * This component showcases all colors, buttons, inputs, badges, alerts,
 * and other UI elements to verify the design system is working correctly.
 *
 * Usage: Import and render this component on any page to see the full design system.
 */

import React, { useState } from 'react';

// ════════════════════════════════════════════════════════════════════════════
// Color Swatch Component
// ════════════════════════════════════════════════════════════════════════════

interface ColorSwatchProps {
  name: string;
  hex: string;
  textDark?: boolean;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({ name, hex, textDark }) => (
  <div className="flex flex-col" data-testid={`swatch-${name.toLowerCase().replace(/\s+/g, '-')}`}>
    <div
      className="h-16 rounded-lg flex items-end justify-between p-2"
      style={{
        backgroundColor: hex,
        color: textDark ? '#0f0f13' : '#ffffff'
      }}
    >
      <span className="text-xs font-medium opacity-80">{name}</span>
      <span className="text-xs font-mono opacity-60">{hex}</span>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
// Section Header Component
// ════════════════════════════════════════════════════════════════════════════

const SectionHeader: React.FC<{ title: string; description?: string; isDark?: boolean }> = ({
  title,
  description,
  isDark = true
}) => (
  <div className="mb-6">
    <h2
      className="text-2xl font-bold mb-1"
      style={{ color: isDark ? '#f4f4f5' : '#171717' }}
    >
      {title}
    </h2>
    {description && (
      <p
        className="text-sm"
        style={{ color: isDark ? '#a1a1aa' : '#525252' }}
      >
        {description}
      </p>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
// Main Preview Component
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// Theme Toggle Component
// ════════════════════════════════════════════════════════════════════════════

const ThemeToggle: React.FC<{ isDark: boolean; onToggle: () => void }> = ({ isDark, onToggle }) => (
  <button
    onClick={onToggle}
    className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all duration-300 shadow-lg"
    style={{
      backgroundColor: isDark ? '#252530' : '#ffffff',
      color: isDark ? '#f4f4f5' : '#262626',
      border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5'
    }}
    data-testid="theme-toggle"
  >
    {isDark ? (
      <>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        Light Mode
      </>
    ) : (
      <>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
        Dark Mode
      </>
    )}
  </button>
);

const ColorSystemPreview: React.FC = () => {
  const [isDark, setIsDark] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [selectedRadio, setSelectedRadio] = useState('option1');

  return (
    <div className={isDark ? 'dark' : ''}>
      <ThemeToggle isDark={isDark} onToggle={() => setIsDark(!isDark)} />

      <div
        className="min-h-screen p-8 transition-colors duration-300"
        style={{ backgroundColor: isDark ? '#0f0f13' : '#fafafa' }}
        data-testid="color-system-preview"
      >
        {/* Header with Logo Colors */}
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src="/logo.png"
                alt="Ushadow Logo"
                className="h-24 w-auto"
                data-testid="logo"
              />
            </div>

            <h1
              className="text-4xl font-bold bg-clip-text text-transparent mb-4"
              style={{ backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)' }}
            >
              Ushadow Design System
            </h1>
            <p
              className="max-w-2xl mx-auto"
              style={{ color: isDark ? '#a1a1aa' : '#525252' }}
            >
              A comprehensive color system designed around the Ushadow logo, featuring
              vibrant greens and purples. Toggle between dark and light modes to preview both themes.
            </p>
          </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BRAND COLORS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Brand Colors"
            description="Primary and accent colors extracted from the logo"
            isDark={isDark}
          />

          <div className="grid grid-cols-2 gap-8">
            {/* Primary Green Scale */}
            <div>
              <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Primary (Green)
              </h3>
              <div className="grid grid-cols-5 gap-2">
                <ColorSwatch name="50" hex="#f0fdf4" textDark />
                <ColorSwatch name="100" hex="#dcfce7" textDark />
                <ColorSwatch name="200" hex="#bbf7d0" textDark />
                <ColorSwatch name="300" hex="#86efac" textDark />
                <ColorSwatch name="400" hex="#4ade80" textDark />
                <ColorSwatch name="500" hex="#22c55e" />
                <ColorSwatch name="600" hex="#16a34a" />
                <ColorSwatch name="700" hex="#15803d" />
                <ColorSwatch name="800" hex="#166534" />
                <ColorSwatch name="900" hex="#14532d" />
              </div>
            </div>

            {/* Accent Purple Scale */}
            <div>
              <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Accent (Purple)
              </h3>
              <div className="grid grid-cols-5 gap-2">
                <ColorSwatch name="50" hex="#faf5ff" textDark />
                <ColorSwatch name="100" hex="#f3e8ff" textDark />
                <ColorSwatch name="200" hex="#e9d5ff" textDark />
                <ColorSwatch name="300" hex="#d8b4fe" textDark />
                <ColorSwatch name="400" hex="#c084fc" />
                <ColorSwatch name="500" hex="#a855f7" />
                <ColorSwatch name="600" hex="#9333ea" />
                <ColorSwatch name="700" hex="#7e22ce" />
                <ColorSwatch name="800" hex="#6b21a8" />
                <ColorSwatch name="900" hex="#581c87" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SURFACE COLORS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Surface Colors"
            description="Dark theme background hierarchy"
            isDark={isDark}
          />

          <div className="grid grid-cols-6 gap-4">
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#0f0f13', border: '1px solid #3d3d4a' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>900</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Page BG</span>
              </div>
            </div>
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#1a1a21', border: '1px solid #3d3d4a' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>800</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Cards</span>
              </div>
            </div>
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#252530', border: '1px solid #3d3d4a' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>700</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Inputs</span>
              </div>
            </div>
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#2d2d3a', border: '1px solid #3d3d4a' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>600</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Hover</span>
              </div>
            </div>
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#3d3d4a', border: '1px solid #52525b' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>500</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Borders</span>
              </div>
            </div>
            <div className="flex flex-col">
              <div
                className="h-24 rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: '#52525b' }}
              >
                <span className="text-xs font-medium" style={{ color: '#f4f4f5' }}>400</span>
                <span className="text-xs" style={{ color: '#71717a' }}>Subtle</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SEMANTIC COLORS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Semantic Colors"
            description="Feedback and state colors"
            isDark={isDark}
          />

          <div className="grid grid-cols-4 gap-6">
            {/* Success */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#4ade80' }}>Success</h3>
              <div className="space-y-2">
                <ColorSwatch name="Light" hex="#86efac" textDark />
                <ColorSwatch name="Default" hex="#4ade80" textDark />
                <ColorSwatch name="Dark" hex="#16a34a" />
              </div>
            </div>

            {/* Error */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#f87171' }}>Error</h3>
              <div className="space-y-2">
                <ColorSwatch name="Light" hex="#fca5a5" textDark />
                <ColorSwatch name="Default" hex="#f87171" textDark />
                <ColorSwatch name="Dark" hex="#dc2626" />
              </div>
            </div>

            {/* Warning */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#fbbf24' }}>Warning</h3>
              <div className="space-y-2">
                <ColorSwatch name="Light" hex="#fcd34d" textDark />
                <ColorSwatch name="Default" hex="#fbbf24" textDark />
                <ColorSwatch name="Dark" hex="#d97706" />
              </div>
            </div>

            {/* Info */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#60a5fa' }}>Info</h3>
              <div className="space-y-2">
                <ColorSwatch name="Light" hex="#93c5fd" textDark />
                <ColorSwatch name="Default" hex="#60a5fa" textDark />
                <ColorSwatch name="Dark" hex="#2563eb" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BUTTONS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Buttons"
            description="Interactive button states"
            isDark={isDark}
          />

          <div
            className="rounded-xl p-8 space-y-8"
            style={{
              backgroundColor: isDark ? '#1a1a21' : '#ffffff',
              border: isDark ? 'none' : '1px solid #e5e5e5',
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            {/* Primary Buttons */}
            <div>
              <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Primary (Green)
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  className="px-6 py-2.5 font-medium rounded-lg transition-all"
                  style={{ backgroundColor: '#4ade80', color: '#0f0f13' }}
                  data-testid="btn-primary"
                >
                  Default
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{ backgroundColor: '#86efac', color: '#0f0f13' }}
                  data-testid="btn-primary-hover"
                >
                  Hover
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{ backgroundColor: '#22c55e', color: '#0f0f13' }}
                  data-testid="btn-primary-active"
                >
                  Active
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg cursor-not-allowed"
                  style={{ backgroundColor: 'rgba(74, 222, 128, 0.4)', color: 'rgba(15, 15, 19, 0.5)' }}
                  disabled
                  data-testid="btn-primary-disabled"
                >
                  Disabled
                </button>
              </div>
            </div>

            {/* Secondary Buttons */}
            <div>
              <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Secondary (Purple)
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  className="px-6 py-2.5 text-white font-medium rounded-lg transition-all"
                  style={{ backgroundColor: '#a855f7' }}
                  data-testid="btn-secondary"
                >
                  Default
                </button>
                <button className="px-6 py-2.5 text-white font-medium rounded-lg" style={{ backgroundColor: '#c084fc' }}>
                  Hover
                </button>
                <button className="px-6 py-2.5 text-white font-medium rounded-lg" style={{ backgroundColor: '#9333ea' }}>
                  Active
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg cursor-not-allowed"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.4)', color: 'rgba(255, 255, 255, 0.5)' }}
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>

            {/* Ghost Buttons */}
            <div>
              <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Ghost / Outline
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  className="px-6 py-2.5 font-medium rounded-lg transition-all"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${isDark ? '#52525b' : '#d4d4d4'}`,
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                  data-testid="btn-ghost"
                >
                  Default
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{
                    backgroundColor: isDark ? '#2d2d3a' : '#f5f5f5',
                    border: `1px solid ${isDark ? '#a1a1aa' : '#a3a3a3'}`,
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                >
                  Hover
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{
                    backgroundColor: isDark ? '#252530' : '#e5e5e5',
                    border: `1px solid ${isDark ? '#f4f4f5' : '#737373'}`,
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                >
                  Active
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg cursor-not-allowed"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${isDark ? 'rgba(61, 61, 74, 0.5)' : '#e5e5e5'}`,
                    color: isDark ? '#71717a' : '#a3a3a3'
                  }}
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>

            {/* Danger Buttons */}
            <div>
              <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Danger
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  className="px-6 py-2.5 text-white font-medium rounded-lg transition-all"
                  style={{ backgroundColor: '#dc2626' }}
                  data-testid="btn-danger"
                >
                  Default
                </button>
                <button className="px-6 py-2.5 text-white font-medium rounded-lg" style={{ backgroundColor: '#ef4444' }}>
                  Hover
                </button>
                <button className="px-6 py-2.5 text-white font-medium rounded-lg" style={{ backgroundColor: '#b91c1c' }}>
                  Active
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg cursor-not-allowed"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.4)', color: 'rgba(255, 255, 255, 0.5)' }}
                  disabled
                >
                  Disabled
                </button>
              </div>
            </div>

            {/* Gradient Button */}
            <div>
              <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Brand Gradient
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
                    color: '#0f0f13',
                    boxShadow: '0 0 20px rgba(74, 222, 128, 0.2), 0 0 40px rgba(168, 85, 247, 0.2)'
                  }}
                  data-testid="btn-gradient"
                >
                  Gradient CTA
                </button>
                <button
                  className="px-6 py-2.5 font-medium rounded-lg"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #86efac 0%, #c084fc 100%)',
                    boxShadow: '0 0 20px rgba(74, 222, 128, 0.2), 0 0 40px rgba(168, 85, 247, 0.2)',
                    color: '#0f0f13'
                  }}
                >
                  Hover
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FORM INPUTS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Form Inputs"
            description="Input fields and form controls"
            isDark={isDark}
          />

          <div
            className="rounded-xl p-8 space-y-8"
            style={{
              backgroundColor: isDark ? '#1a1a21' : '#ffffff',
              border: isDark ? 'none' : '1px solid #e5e5e5',
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            {/* Text Inputs */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                  Default Input
                </label>
                <input
                  type="text"
                  placeholder="Enter text..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                  style={{
                    backgroundColor: isDark ? '#252530' : '#fafafa',
                    border: isDark ? '1px solid #52525b' : '1px solid #d4d4d4',
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                  data-testid="input-default"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                  Focus State
                </label>
                <input
                  type="text"
                  placeholder="Focused input"
                  className="w-full px-4 py-2.5 rounded-lg"
                  style={{
                    backgroundColor: isDark ? '#252530' : '#fafafa',
                    border: '1px solid #4ade80',
                    boxShadow: '0 0 0 1px #4ade80',
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                  data-testid="input-focus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#f87171' }}>
                  Error State
                </label>
                <input
                  type="text"
                  placeholder="Invalid input"
                  className="w-full px-4 py-2.5 rounded-lg"
                  style={{
                    backgroundColor: isDark ? '#252530' : '#fafafa',
                    border: '1px solid #f87171',
                    boxShadow: '0 0 0 1px #f87171',
                    color: isDark ? '#f4f4f5' : '#171717'
                  }}
                  data-testid="input-error"
                />
                <p className="mt-1.5 text-sm" style={{ color: '#f87171' }}>This field is required</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#71717a' }}>
                  Disabled State
                </label>
                <input
                  type="text"
                  placeholder="Disabled input"
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg cursor-not-allowed"
                  style={{
                    backgroundColor: isDark ? '#1a1a21' : '#f5f5f5',
                    border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5',
                    color: '#71717a'
                  }}
                  data-testid="input-disabled"
                />
              </div>
            </div>

            {/* Checkboxes & Toggles */}
            <div className="flex gap-12">
              <div>
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                  Checkbox
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer" data-testid="checkbox-unchecked">
                    <div
                      className="w-5 h-5 rounded border-2"
                      style={{
                        backgroundColor: isDark ? '#252530' : '#fafafa',
                        borderColor: isDark ? '#52525b' : '#d4d4d4'
                      }}
                    />
                    <span style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Unchecked</span>
                  </label>
                  <label
                    className="flex items-center gap-3 cursor-pointer"
                    data-testid="checkbox-checked"
                    onClick={() => setCheckboxChecked(!checkboxChecked)}
                  >
                    <div
                      className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: checkboxChecked ? '#4ade80' : (isDark ? '#252530' : '#fafafa'),
                        borderColor: checkboxChecked ? '#4ade80' : (isDark ? '#52525b' : '#d4d4d4')
                      }}
                    >
                      {checkboxChecked && (
                        <svg className="w-3 h-3" style={{ color: '#0f0f13' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Checked (click me)</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                  Toggle
                </h3>
                <div className="space-y-3">
                  <label
                    className="flex items-center gap-3 cursor-pointer"
                    data-testid="toggle"
                    onClick={() => setToggleOn(!toggleOn)}
                  >
                    <div
                      className="relative w-11 h-6 rounded-full transition-all"
                      style={{ backgroundColor: toggleOn ? '#4ade80' : '#52525b' }}
                    >
                      <div
                        className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow"
                        style={{ left: toggleOn ? '24px' : '4px' }}
                      />
                    </div>
                    <span style={{ color: isDark ? '#f4f4f5' : '#171717' }}>{toggleOn ? 'On' : 'Off'} (click me)</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                  Radio Buttons
                </h3>
                <div className="space-y-3">
                  {['option1', 'option2'].map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-3 cursor-pointer"
                      data-testid={`radio-${option}`}
                      onClick={() => setSelectedRadio(option)}
                    >
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
                        style={{
                          borderColor: selectedRadio === option ? '#4ade80' : (isDark ? '#52525b' : '#d4d4d4')
                        }}
                      >
                        {selectedRadio === option && (
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                        )}
                      </div>
                      <span style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Option {option.slice(-1)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BADGES */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Badges"
            description="Status indicators and labels"
            isDark={isDark}
          />

          <div
            className="rounded-xl p-8"
            style={{
              backgroundColor: isDark ? '#1a1a21' : '#ffffff',
              border: isDark ? 'none' : '1px solid #e5e5e5',
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <div className="flex flex-wrap gap-4">
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(20, 83, 45, 0.3)' : '#dcfce7',
                  color: isDark ? '#86efac' : '#166534'
                }}
                data-testid="badge-primary"
              >
                Primary
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(88, 28, 135, 0.3)' : '#f3e8ff',
                  color: isDark ? '#d8b4fe' : '#6b21a8'
                }}
                data-testid="badge-accent"
              >
                Accent
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(20, 83, 45, 0.3)' : '#dcfce7',
                  color: isDark ? '#86efac' : '#166534'
                }}
                data-testid="badge-success"
              >
                Success
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(120, 53, 15, 0.3)' : '#fef3c7',
                  color: isDark ? '#fcd34d' : '#92400e'
                }}
                data-testid="badge-warning"
              >
                Warning
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(127, 29, 29, 0.3)' : '#fee2e2',
                  color: isDark ? '#fca5a5' : '#991b1b'
                }}
                data-testid="badge-error"
              >
                Error
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe',
                  color: isDark ? '#93c5fd' : '#1e40af'
                }}
                data-testid="badge-info"
              >
                Info
              </span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: isDark ? '#3d3d4a' : '#f5f5f5',
                  color: isDark ? '#d4d4d4' : '#404040'
                }}
                data-testid="badge-neutral"
              >
                Neutral
              </span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ALERTS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Alerts"
            description="Notification and feedback messages"
            isDark={isDark}
          />

          <div className="space-y-4">
            {/* Success Alert */}
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid rgba(74, 222, 128, 0.2)'
              }}
              data-testid="alert-success"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#4ade80' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium" style={{ color: '#4ade80' }}>Success!</h4>
                <p className="text-sm mt-1" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>Your changes have been saved successfully.</p>
              </div>
            </div>

            {/* Error Alert */}
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.2)'
              }}
              data-testid="alert-error"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium" style={{ color: '#f87171' }}>Error</h4>
                <p className="text-sm mt-1" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>There was a problem processing your request.</p>
              </div>
            </div>

            {/* Warning Alert */}
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.2)'
              }}
              data-testid="alert-warning"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="font-medium" style={{ color: '#fbbf24' }}>Warning</h4>
                <p className="text-sm mt-1" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>Your session will expire in 5 minutes.</p>
              </div>
            </div>

            {/* Info Alert */}
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                border: '1px solid rgba(96, 165, 250, 0.2)'
              }}
              data-testid="alert-info"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#60a5fa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium" style={{ color: '#60a5fa' }}>Information</h4>
                <p className="text-sm mt-1" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>A new version is available. Please refresh to update.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CARDS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Cards"
            description="Container components with various styles"
            isDark={isDark}
          />

          <div className="grid grid-cols-3 gap-6">
            {/* Basic Card */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5',
                boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-basic"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Basic Card</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                A simple card with surface background and subtle border.
              </p>
            </div>

            {/* Card with Glow */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid #e5e5e5',
                backgroundImage: isDark ? 'radial-gradient(ellipse at top, rgba(74, 222, 128, 0.25) 0%, transparent 60%)' : 'none',
                boxShadow: isDark ? '0 4px 20px rgba(74, 222, 128, 0.15), 0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-glow-green"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Green Glow</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Card with green radial gradient effect.
              </p>
            </div>

            {/* Card with Purple Glow */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid #e5e5e5',
                backgroundImage: isDark ? 'radial-gradient(ellipse at bottom right, rgba(168, 85, 247, 0.25) 0%, transparent 60%)' : 'none',
                boxShadow: isDark ? '0 4px 20px rgba(168, 85, 247, 0.15), 0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-glow-purple"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Purple Glow</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Card with purple radial gradient effect.
              </p>
            </div>

            {/* Hover Card */}
            <div
              className="rounded-xl p-6 transition-all cursor-pointer hover:scale-[1.02]"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5',
                boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-hover"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Hover Card</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Hover over this card to see the shadow effect.
              </p>
            </div>

            {/* Accent Border Card */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5',
                borderLeft: '5px solid #4ade80',
                boxShadow: isDark ? '0 0 15px rgba(74, 222, 128, 0.1), 0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-accent-green"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#4ade80' : '#16a34a' }}>Green Accent</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Card with primary color left border accent.
              </p>
            </div>

            {/* Purple Accent Border Card */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? '#1a1a21' : '#ffffff',
                border: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5',
                borderLeft: '5px solid #a855f7',
                boxShadow: isDark ? '0 0 15px rgba(168, 85, 247, 0.1), 0 4px 6px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
              data-testid="card-accent-purple"
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: isDark ? '#a855f7' : '#7e22ce' }}>Purple Accent</h3>
              <p className="text-sm" style={{ color: isDark ? '#a1a1aa' : '#525252' }}>
                Card with accent color left border accent.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MENU ITEMS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Menu & Navigation"
            description="Navigation items and menu states"
            isDark={isDark}
          />

          <div
            className="rounded-xl p-2 w-64"
            style={{
              backgroundColor: isDark ? '#1a1a21' : '#ffffff',
              border: isDark ? 'none' : '1px solid #e5e5e5',
              boxShadow: isDark ? '0 10px 15px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0,0,0,0.15)'
            }}
          >
            <nav className="space-y-1" data-testid="menu">
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
                style={{ color: isDark ? '#a1a1aa' : '#525252' }}
                data-testid="menu-item-default"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Default Item
              </a>
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
                style={{
                  backgroundColor: isDark ? '#2d2d3a' : '#f5f5f5',
                  color: isDark ? '#f4f4f5' : '#171717'
                }}
                data-testid="menu-item-hover"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Hover State
              </a>
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
                style={{
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  color: '#4ade80',
                  borderLeft: '2px solid #4ade80'
                }}
                data-testid="menu-item-active"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Active Item
              </a>
              <div className="my-2" style={{ borderTop: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5' }} />
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-2.5 cursor-not-allowed"
                style={{ color: '#71717a' }}
                data-testid="menu-item-disabled"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Disabled Item
              </a>
            </nav>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TYPOGRAPHY */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section className="mb-16">
          <SectionHeader
            title="Typography"
            description="Text styles and hierarchy"
            isDark={isDark}
          />

          <div
            className="rounded-xl p-8 space-y-6"
            style={{
              backgroundColor: isDark ? '#1a1a21' : '#ffffff',
              border: isDark ? 'none' : '1px solid #e5e5e5',
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <div>
              <h1 className="text-4xl font-bold" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Heading 1</h1>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-4xl font-bold text-text-primary</p>
            </div>
            <div>
              <h2 className="text-3xl font-bold" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Heading 2</h2>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-3xl font-bold text-text-primary</p>
            </div>
            <div>
              <h3 className="text-2xl font-semibold" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Heading 3</h3>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-2xl font-semibold text-text-primary</p>
            </div>
            <div>
              <h4 className="text-xl font-semibold" style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Heading 4</h4>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-xl font-semibold text-text-primary</p>
            </div>
            <div className="pt-6" style={{ borderTop: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5' }}>
              <p style={{ color: isDark ? '#f4f4f5' : '#171717' }}>Primary body text - used for main content and important information.</p>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-text-primary</p>
            </div>
            <div>
              <p style={{ color: isDark ? '#a1a1aa' : '#525252' }}>Secondary body text - used for descriptions and supporting content.</p>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-text-secondary</p>
            </div>
            <div>
              <p style={{ color: '#71717a' }}>Muted text - used for captions, placeholders, and disabled content.</p>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-text-muted</p>
            </div>
            <div>
              <a href="#" className="underline" style={{ color: '#4ade80' }}>Link text with primary color</a>
              <p className="text-sm mt-1" style={{ color: '#71717a' }}>text-primary-400 hover:text-primary-300</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          className="text-center py-8"
          style={{ borderTop: isDark ? '1px solid #3d3d4a' : '1px solid #e5e5e5' }}
        >
          <p className="text-sm" style={{ color: isDark ? '#71717a' : '#737373' }}>
            Ushadow Design System &bull; Built with Tailwind CSS
          </p>
        </footer>
        </div>
      </div>
    </div>
  );
};

export default ColorSystemPreview;
