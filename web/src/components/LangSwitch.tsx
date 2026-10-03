import type { Lang } from '../api';
import { t } from '../i18n';

const LANGS: Lang[] = ['fr', 'en'];

// Choix Français / Anglais ; compact : "FR" / "EN".
// names : noms affichés à la place des noms traduits (ex. "Français" / "English" pour la langue de l'interface)
export function LangSwitch({ value, onChange, compact = false, label, names }: {
  value: Lang;
  onChange: (lang: Lang) => void;
  compact?: boolean;
  label?: string;
  names?: Record<Lang, string>;
}) {
  return (
    <div className="lang-switch" role="radiogroup" aria-label={label ?? t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l}
          className={value === l ? 'lang-opt lang-opt-on' : 'lang-opt'} onClick={() => onChange(l)}>
          {compact ? l.toUpperCase() : names?.[l] ?? t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}
