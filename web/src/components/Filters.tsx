import { useEffect, useState } from 'react';
import { api, type SetInfo } from '../api';
import { useApp } from '../store';
import { Icon } from './Icon';

export const COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
const COLOR_FR: Record<string, string> = {
  Red: 'Rouge', Green: 'Vert', Blue: 'Bleu', Purple: 'Violet', Black: 'Noir', Yellow: 'Jaune',
};
export const RARITIES = ['L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'P', 'TR'];

export function useSets() {
  const { version } = useApp();
  const [sets, setSets] = useState<SetInfo[]>([]);
  useEffect(() => { api.sets().then(setSets).catch(() => {}); }, [version]);
  return sets;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Effacer"><Icon name="close" size={16} /></button>
      )}
    </label>
  );
}

export function SetSelect({ value, onChange, ownedOnly = false }: { value: string; onChange: (v: string) => void; ownedOnly?: boolean }) {
  const sets = useSets().filter((s) => !ownedOnly || s.owned > 0);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Toutes les extensions</option>
      {sets.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code ? `${s.code} · ` : ''}{s.name}{ownedOnly ? ` (${s.owned})` : ''}
        </option>
      ))}
    </select>
  );
}

export function ColorSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Couleur</option>
      {COLORS.map((c) => <option key={c} value={c}>{COLOR_FR[c]}</option>)}
    </select>
  );
}

export function RaritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Rareté</option>
      {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
