import React, { createContext, useContext, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

// Theme 1: Blossom Luxe (Option C - Warm Feminine Premium Light Mode)
export const blossomTheme = {
  name: 'blossom',
  displayName: 'Blossom Luxe',
  subtitle: 'Warm violet & magenta light theme',
  isDark: false,
  colors: {
    paper: '#FFF7F9',
    white: '#FFFFFF',
    surfaceElevated: '#FDF2F8',
    ink: '#1E1B4B',
    muted: '#7C7289',
    line: '#F3E8FF',
    primary: '#7C3AED',       // Royal Violet
    primarySoft: '#F3E8FF',   // Lavender tint
    teal: '#059669',          // Safe Green/Teal
    tealSoft: '#ECFDF5',
    pink: '#EC4899',          // Vibrant Rose Magenta
    pinkSoft: '#FDF2F8',
    orange: '#F97316',        // Coral Orange
    yellow: '#EAB308',        // Amber Gold
    blue: '#0284C7',          // Sky Blue
    cardBg: '#FFFFFF',
    cardBorder: '#F1E6FF',
    cardShadow: 'rgba(124, 58, 237, 0.08)',
    tabBarBg: '#FFFFFF',
    topBarBadgeBg: '#F3E8FF',
    topBarBadgeText: '#7C3AED',
    sosBg: '#EC4899',
    sosBorder: '#DB2777',
    safetyCardBg: '#1E1B4B',
    safetyCardBorder: '#312E81',
    safetyCardText: '#FFFFFF',
  },
};

// Theme 2: Midnight Shield (Option B - Futuristic Cyber Dark Mode)
export const midnightTheme = {
  name: 'midnight',
  displayName: 'Midnight Shield',
  subtitle: 'Obsidian dark theme with neon cyan',
  isDark: true,
  colors: {
    paper: '#0D1117',
    white: '#161B22',
    surfaceElevated: '#21262D',
    ink: '#F0F6FC',
    muted: '#8B949E',
    line: '#30363D',
    primary: '#2DD4BF',       // Neon Cyan
    primarySoft: '#134E4A',   // Cyan deep tint
    teal: '#2DD4BF',          // Cyan Teal
    tealSoft: '#134E4A',
    pink: '#FB7185',          // Neon Rose
    pinkSoft: '#4C1D24',
    orange: '#FB923C',        // Soft Neon Orange
    yellow: '#FACC15',        // Bright Yellow
    blue: '#38BDF8',          // Electric Blue
    cardBg: '#161B22',
    cardBorder: '#30363D',
    cardShadow: 'rgba(0, 0, 0, 0.4)',
    tabBarBg: '#161B22',
    topBarBadgeBg: '#1C2D37',
    topBarBadgeText: '#2DD4BF',
    sosBg: '#E11D48',
    sosBorder: '#BE123C',
    safetyCardBg: '#090D14',
    safetyCardBorder: '#1F2937',
    safetyCardText: '#F0F6FC',
  },
};

const ThemeContext = createContext({
  theme: blossomTheme,
  themeName: 'blossom',
  setThemeName: () => {},
  toggleTheme: () => {},
  colors: blossomTheme.colors,
  isDark: false,
});

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState('blossom');

  // Persistence via web localStorage if available
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('safeher_theme');
        if (saved === 'midnight' || saved === 'blossom') {
          setThemeName(saved);
        }
      }
    } catch (e) {
      // Ignore fallback
    }
  }, []);

  const handleSetTheme = (name) => {
    setThemeName(name);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('safeher_theme', name);
      }
    } catch (e) {
      // Ignore
    }
  };

  const toggleTheme = () => {
    const next = themeName === 'blossom' ? 'midnight' : 'blossom';
    handleSetTheme(next);
  };

  const currentTheme = themeName === 'midnight' ? midnightTheme : blossomTheme;

  return (
    <ThemeContext.Provider
      value={{
        theme: currentTheme,
        themeName,
        setThemeName: handleSetTheme,
        toggleTheme,
        colors: currentTheme.colors,
        isDark: currentTheme.isDark,
      }}
    >
      {children}
      <StatusBar style={currentTheme.isDark ? 'light' : 'dark'} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
