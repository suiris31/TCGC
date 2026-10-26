// Raccourcis clavier du plateau : règles pures, sans React ni DOM réel (testées par game/tests/ui-keys.test.ts)

// Ce qu'on lit d'un événement clavier (un KeyboardEvent convient tel quel)
export interface KeyInput {
  key: string;
  defaultPrevented: boolean;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | KeyTarget | null;
}

// Ce qu'on lit de l'élément qui a le focus (un HTMLElement convient tel quel)
export interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

// Éléments à qui la touche Entrée appartient déjà : un bouton la transforme en clic, un champ ou une liste s'en sert
const OWN_ENTER_TAGS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'SUMMARY', 'OPTION']);
const OWN_ENTER_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'listbox', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'tab', 'treeitem', 'gridcell']);

// L'élément qui a le focus se sert lui-même de la touche Entrée
export function ownsEnter(target: KeyInput['target']): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as KeyTarget;
  if (el.isContentEditable) return true;
  if (el.tagName && OWN_ENTER_TAGS.has(el.tagName.toUpperCase())) return true;
  const role = el.getAttribute?.('role');
  return Boolean(role && OWN_ENTER_ROLES.has(role.toLowerCase()));
}

// Entrée finit le tour seulement si la touche n'est destinée à rien d'autre : pas déjà traitée, pas sur un bouton, un
// champ ou une liste qui a le focus (sinon un seul appui jouerait deux choix), pas maintenue enfoncée, sans modificateur
export function isEndTurnKey(e: KeyInput): boolean {
  if (e.key !== 'Enter' || e.defaultPrevented || e.repeat) return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  return !ownsEnter(e.target);
}
