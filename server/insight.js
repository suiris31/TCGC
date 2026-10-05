// « Bon moment pour l'acheter ? » : lecture du prix d'une carte pour un collectionneur qui la cherche.
// Règles volontairement simples, à partir des prix Cardmarket (tendance, moyennes 7 et 30 jours), de l'historique
// enregistré chaque jour par l'appli et de la date de sortie du set. C'est une indication, pas une prédiction.
// La règle « nouveauté qui baisse » vient d'une étude de l'historique des prix de juin à octobre 2026 : une carte d'un
// set de moins de 150 jours dont le prix baisse en Europe et aux États-Unis était le plus souvent nettement moins chère
// 8 semaines plus tard.

const DAY = 86_400_000;
const RECENT_SET_DAYS = 150; // set récent (règle A1)
const NEW_SET_DAYS = 56;     // 8 premières semaines après la sortie
const CHEAP_EUR = 1;
const RECENT_BAN_DAYS = 60;  // après l'annonce d'un bannissement, le prix chute souvent pendant quelques semaines

function change(now, before) {
  return now != null && before ? now / before - 1 : null;
}

// Arrondi vers le bas à un montant « rond » : 0,05 € sous 2 €, 0,50 € sous 20 €, 1 € au-delà
function floorNice(value) {
  const step = value < 2 ? 0.05 : value < 20 ? 0.5 : 1;
  return Math.max(step, Math.round(Math.floor(value / step + 1e-9) * step * 100) / 100);
}

// row : ligne SQL de cards.js (cm_trend, cm_avg7, cm_avg30, cm_14d, market, tcg_14d, published_on) ;
// fallbackEur : prix affiché quand Cardmarket n'a pas de prix (TCGplayer converti)
export function priceInsight(row, fallbackEur = null, today = Date.now()) {
  const avg7 = row.cm_avg7 ?? null;
  const avg30 = row.cm_avg30 ?? null;
  const now = row.cm_trend ?? avg7 ?? avg30;
  const age = row.published_on ? Math.floor((today - Date.parse(row.published_on)) / DAY) : null;
  // Variation récente en Europe : sur 14 jours avec l'historique de l'appli, à défaut moyenne 7 jours face à 30 jours
  const eu = change(now, row.cm_14d) ?? change(avg7, avg30);
  const us = change(row.market, row.tcg_14d);

  // Bannie ou limitée récemment (annonce officielle de moins de 2 mois)
  const recentBan = (row.reg_status === 'banned' || row.reg_status === 'restricted') && row.reg_announced
    && (today - Date.parse(row.reg_announced)) / DAY <= RECENT_BAN_DAYS;

  let kind = null;
  let pct = null;
  if (age != null && age < 0) {
    kind = 'upcoming';
  } else if (recentBan) {
    kind = 'banned';
    pct = eu != null && eu < 0 ? eu : null;
  } else if (now == null) {
    if (age != null && age <= NEW_SET_DAYS) kind = 'new';
  } else if (now < CHEAP_EUR) {
    kind = 'cheap';
  } else if (age != null && age <= RECENT_SET_DAYS && eu != null && eu < 0 && (us == null || us <= 0)) {
    kind = 'new-falling';
    pct = eu;
  } else if (eu != null && eu >= 0.15) {
    kind = 'rising';
    pct = eu;
  } else if (age != null && age <= NEW_SET_DAYS) {
    kind = 'new';
  } else if (avg7 != null && ((eu != null && eu <= -0.1 && now < avg7) || now < avg7 * 0.9)) {
    // baisse qui continue cette semaine, ou chute brutale sous la moyenne de la semaine
    kind = 'falling';
    pct = Math.min(eu ?? 0, now / avg7 - 1);
  } else if (avg7 != null && avg30 != null && now <= avg30 * 0.9 && avg7 <= avg30) {
    // nettement sous la moyenne du mois, et la semaine écoulée confirme ce niveau
    kind = 'good';
    pct = now / avg30 - 1;
  } else {
    kind = 'stable';
  }

  // Prix cible proposé pour une liste de souhaits : sous le plus bas des prix récents, avec plus de marge
  // quand le prix baisse ou que le set vient de sortir (inutile sous 1 €)
  const recent = [row.cm_trend, avg7, avg30].filter((v) => v > 0);
  const base = recent.length ? Math.min(...recent) : fallbackEur;
  const discount = kind === 'banned' ? 0.7 : ['upcoming', 'new', 'new-falling', 'falling'].includes(kind) ? 0.8 : 0.9;
  const target = base >= CHEAP_EUR ? floorNice(base * discount) : null;

  if (!kind && !target) return null;
  return {
    kind,
    change: pct == null ? null : Math.round(pct * 1000) / 1000,
    weeks: age == null ? null : Math.max(1, Math.ceil(Math.abs(age) / 7)),
    // bannissement : statut et date de l'annonce
    ban: kind === 'banned' ? { status: row.reg_status, announced: row.reg_announced } : null,
    target,
  };
}
