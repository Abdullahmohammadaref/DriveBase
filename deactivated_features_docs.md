# Deactivated Features Documentation

> **CRITICAL NOTICE FOR DEVELOPERS & AI ASSISTANTS**  
> DO NOT delete any commented code referencing deactivated features in this repository!  
> The commented code blocks are intentionally preserved so they can be seamlessly reactivated in the future.

---

## Overview of Deactivated Features

| Feature | Scope | Status | Preserved In Files |
| :--- | :--- | :--- | :--- |
| **Arabic (`ar`) & Turkish (`tr`) Languages** | Internationalization (i18n) | **Deactivated** (Active: `de` primary, `en` secondary) | [`frontend/src/lib/i18n.ts`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/lib/i18n.ts)<br>[`frontend/src/components/layout/LanguageSwitcher.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/LanguageSwitcher.tsx)<br>[`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx) |
| **Dark Mode Toggle Button** | Theme / UI | **Deactivated** (Commented out in Header & Auth layout) | [`frontend/src/components/layout/Header.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/Header.tsx)<br>[`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx) |

---

## 1. Internationalization: Arabic (`ar`) & Turkish (`tr`) Deactivation

### Context & Configuration
- **Primary Website Language:** German (`de`) — default without URL prefix (`/:business_slug/...`).
- **Secondary Website Language:** English (`en`) — accessed via URL prefix (`/:business_slug/en/...`).
- **Base Code Language:** English (`en`) — fallback language for missing translation keys.
- **Deactivated Languages:** Arabic (`ar`) and Turkish (`tr`) are excluded from active user switching. The translation button toggles strictly between German and English.
- **Preserved Assets:** 
  - Translation files [`frontend/src/locales/ar.json`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/locales/ar.json) and [`frontend/src/locales/tr.json`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/locales/tr.json) remain fully intact and loaded in i18next resources.
  - SVG flag components (`TurkishFlag`, `ArabicFlag`) and `LOCALE_CONFIG` entries are preserved.

### Files Involved & Code Preserved

1. **[`frontend/src/lib/i18n.ts`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/lib/i18n.ts)**
   - `SUPPORTED_LOCALES` is set to `['de', 'en'] as const`.
   - `ALL_LOCALES` contains `['de', 'en', 'tr', 'ar'] as const`.
   - Resources for `tr` and `ar` remain imported and registered so reactivation requires no asset reloading.

2. **[`frontend/src/components/layout/LanguageSwitcher.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/LanguageSwitcher.tsx)**
   - `getNextLocale` function is configured to toggle between `de` and `en`:
     ```tsx
     const getNextLocale = (current: SupportedLocale): SupportedLocale => {
         return current === 'de' ? 'en' : 'de'
     }
     ```
   - The original 4-locale cycle (`['de', 'tr', 'en', 'ar']`) is preserved in comments with explicit warnings against deletion.

3. **[`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx)**
   - `getNextLocale` toggle similarly set to `de` <-> `en`.
   - The 4-locale cycle is preserved in comments with warnings.

### How to Reactivate Arabic and Turkish
1. In [`frontend/src/lib/i18n.ts`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/lib/i18n.ts):
   Change:
   ```ts
   export const SUPPORTED_LOCALES = ['de', 'en'] as const;
   ```
   To:
   ```ts
   export const SUPPORTED_LOCALES = ['de', 'en', 'tr', 'ar'] as const;
   ```
2. In [`frontend/src/components/layout/LanguageSwitcher.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/LanguageSwitcher.tsx) and [`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx):
   Uncomment the 4-language cycle in `getNextLocale`:
   ```tsx
   const getNextLocale = (current: SupportedLocale): SupportedLocale => {
       const order: SupportedLocale[] = ['de', 'tr', 'en', 'ar']
       const currentIndex = order.indexOf(current)
       return order[(currentIndex + 1) % order.length]
   }
   ```

---

## 2. Dark Mode Toggle Button Deactivation

### Context & Configuration
- Dark mode toggle buttons in both the main application header and the authentication layout have been commented out per user request.
- The underlying dark mode logic, Tailwind dark variants, and theme persistence (`localStorage.getItem("theme")`) remain fully functional.
- The button JSX has been commented out, and dummy references (`void toggleDarkMode; void darkMode; void Sun; void Moon;`) prevent TypeScript `noUnusedLocals` compilation errors.

### Files Involved & Code Preserved

1. **[`frontend/src/components/layout/Header.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/Header.tsx)**
   - Button JSX commented out:
     ```tsx
     {/* 
       ============================================================================
       DEACTIVATED FEATURE: Dark Mode Toggle Button
       WARNING: DO NOT DELETE THIS COMMENTED CODE!
       This button is temporarily deactivated per user request and will be reactivated later.
       See deactivated_features_docs.md for details and reactivation instructions.
       ============================================================================
     */}
     {/*
     <button
         onClick={toggleDarkMode}
         ...
     >
         {darkMode ? <Sun ... /> : <Moon ... />}
     </button>
     */}
     ```

2. **[`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx)**
   - Button JSX commented out:
     ```tsx
     {/* 
       ============================================================================
       DEACTIVATED FEATURE: Dark Mode Toggle Button
       WARNING: DO NOT DELETE THIS COMMENTED CODE!
       This button is temporarily deactivated per user request and will be reactivated later.
       See deactivated_features_docs.md for details and reactivation instructions.
       ============================================================================
     */}
     {/*
     <Button
         variant="ghost"
         size="icon"
         onClick={toggleDarkMode}
         ...
     >
         {darkMode ? <Sun ... /> : <Moon ... />}
     </Button>
     */}
     ```

### How to Reactivate Dark Mode Toggle
1. In [`frontend/src/components/layout/Header.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/layout/Header.tsx):
   - Remove `/*` and `*/` surrounding the `<button onClick={toggleDarkMode}>` JSX.
   - Remove `void darkMode; void toggleDarkMode; void Sun; void Moon;`.
2. In [`frontend/src/components/auth/AuthLayout.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/auth/AuthLayout.tsx):
   - Remove `/*` and `*/` surrounding the `<Button onClick={toggleDarkMode}>` JSX.
   - Remove `void darkMode; void toggleDarkMode; void Sun; void Moon;`.

---

## 3. Preserved Language Catalogs (`en.json` & `de.json`)

All 205 translation keys referenced across the codebase are fully synchronized and populated in both:
- [`frontend/src/locales/en.json`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/locales/en.json)
- [`frontend/src/locales/de.json`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/locales/de.json)

Both catalogs adhere to automotive industry terminology (e.g., *Rechtsträger*, *Fahrgestellnummer / FIN*, *Amtl. Kennzeichen*, *Zulassungsbescheinigung*, *Einkauf / Verkauf Brutto & Netto*, *Bestandstage*, *Vorschäden*, *Schlüsselnummern*).
