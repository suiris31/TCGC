import { useEffect, useState } from 'react';
import { api } from '../api';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../i18n';
import { LEGAL } from '../legal';
import { useApp } from '../store';

// Mentions légales et politique de confidentialité (#legal), accessibles sans compte
export function LegalPage() {
  const { uiLang, setUiLang } = useApp();
  const [info, setInfo] = useState<{ publisher: string; contact: string; host: string } | null>(null);
  const texts = LEGAL[uiLang];

  useEffect(() => { api.legal().then(setInfo).catch(() => setInfo({ publisher: '', contact: '', host: '' })); }, []);

  const fill = (text: string) => text.replace(/\{(publisher|contact|host)\}/g, (m, key: 'publisher' | 'contact' | 'host') =>
    info?.[key] || `(${texts.notSet})`);

  return (
    <>
      <header className="topbar">
        <a className="back-btn" href="#"><span aria-hidden="true">‹</span> {texts.back}</a>
        <LangSwitch value={uiLang} onChange={setUiLang} compact label={t('stats.uiLang')} />
      </header>
      <div className="page legal">
        <h2>{texts.title}</h2>
        {info && texts.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.paragraphs?.map((p) => <p key={p}>{fill(p)}</p>)}
            {section.bullets && <ul>{section.bullets.map((b) => <li key={b}>{fill(b)}</li>)}</ul>}
          </section>
        ))}
      </div>
    </>
  );
}

// Lien vers la page, en bas de l'accueil, du profil et des pages partagées
export function LegalLink() {
  return <a className="legal-link" href="#legal">{t('legal.link')}</a>;
}
