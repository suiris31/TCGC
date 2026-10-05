import { formatDate, formatPct, type Card, type InsightKind } from '../api';
import { t } from '../i18n';

// Couleur de chaque lecture du prix : vert = bon moment, ambre = patienter, rouge = emballement
const TONE: Record<InsightKind, 'good' | 'wait' | 'hot' | 'neutral'> = {
  upcoming: 'wait',
  banned: 'hot',
  new: 'wait',
  'new-falling': 'wait',
  falling: 'wait',
  rising: 'hot',
  good: 'good',
  stable: 'neutral',
  cheap: 'neutral',
};

export function InsightChip({ kind }: { kind: InsightKind }) {
  return <span className={`insight-chip insight-${TONE[kind]}`}>{t(`insight.label.${kind}`)}</span>;
}

// Fiche d'une carte : « Bon moment pour l'acheter ? »
export function InsightBox({ card }: { card: Card }) {
  const insight = card.insight;
  if (!insight?.kind) return null;
  const vars = {
    n: insight.weeks ?? 0,
    pct: insight.change != null ? formatPct(insight.change) : '',
    status: insight.ban ? t(`reg.word.${insight.ban.status}`) : '',
    date: insight.ban ? formatDate(insight.ban.announced) : '',
  };
  return (
    <section className={`insight insight-${TONE[insight.kind]}`}>
      <div className="insight-head">
        <h3>{t('insight.title')}</h3>
        <InsightChip kind={insight.kind} />
      </div>
      <p>{t(`insight.text.${insight.kind}`, vars)}</p>
      <p className="muted small">{t('insight.note')}</p>
    </section>
  );
}
