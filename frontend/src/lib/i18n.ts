import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from '@/locales/de.json';
import en from '@/locales/en.json';
import tr from '@/locales/tr.json';
import ar from '@/locales/ar.json';

// ============================================================================
// DEACTIVATED FEATURE: Arabic ('ar') and Turkish ('tr') Language Options
// WARNING: DO NOT DELETE THIS CODE!
// These locales are temporarily deactivated per user request.
// The language switcher now toggles exclusively between German and English.
// To reactivate: Add 'tr' and 'ar' into the SUPPORTED_LOCALES array below.
// See deactivated_features_docs.md for details and reactivation instructions.
// ============================================================================

// Currently active selectable locales: German (primary) and English (secondary)
export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

// All defined locales (kept for backwards compatibility and easy reactivation)
export const ALL_LOCALES = ['de', 'en', 'tr', 'ar'] as const;
export type AnyLocale = typeof ALL_LOCALES[number];

// Default primary website locale is German ('de')
export const DEFAULT_LOCALE: SupportedLocale = 'de';

// Locale display names and flags
export const LOCALE_CONFIG: Record<AnyLocale, { name: string; nativeName: string; flag: string }> = {
    de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
    // DEACTIVATED: Turkish and Arabic entries preserved for future reactivation
    tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
};

i18n
    .use(initReactI18next)
    .init({
        resources: {
            de: { translation: de },
            en: { translation: en },
            // DEACTIVATED: Preserved loaded translation resources so reactivation is instant
            tr: { translation: tr },
            ar: { translation: ar },
        },
        lng: DEFAULT_LOCALE, // Primary website language: German ('de')
        fallbackLng: 'en', // Language written in code is English ('en')
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        debug: false,
    });

export default i18n;
