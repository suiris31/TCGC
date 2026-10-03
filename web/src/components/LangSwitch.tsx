import { LANG_LABEL, type Lang } from '../api';

const LANGS: Lang[] = ['fr', 'en'];

// Choix Français / Anglais ; compact : "FR" / "EN"
export function LangSwitch({ value, onChange, compact = false, label = 'Langue' }: {
  value: Lang;
  onChange: (lang: Lang) => void;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div className="lang-switch" role="radiogroup" aria-label={label}>
      {LANGS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l}
          className={value === l ? 'lang-opt lang-opt-on' : 'lang-opt'} onClick={() => onChange(l)}>
          {compact ? l.toUpperCase() : LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
