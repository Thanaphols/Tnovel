'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { languages, Language, TranslationKey } from './languages';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'th',
  setLang: () => {},
  toggleLang: () => {},
  t: (key: TranslationKey) => languages.th[key] || (key as string),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('th');

  useEffect(() => {
    const saved = localStorage.getItem('tnovel_lang') as Language;
    if (saved === 'th' || saved === 'en') {
      setLangState(saved);
    }
  }, []);

  function setLang(newLang: Language) {
    setLangState(newLang);
    localStorage.setItem('tnovel_lang', newLang);
  }

  function toggleLang() {
    setLang(lang === 'th' ? 'en' : 'th');
  }

  function t(key: TranslationKey): string {
    return languages[lang][key] || languages.th[key] || (key as string);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
