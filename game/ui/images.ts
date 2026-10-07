// Visuels officiels des cartes, relayés et mis en cache par le serveur TCGC : liste officielle française, ou anglaise
// pour les cartes qui n'existent pas en VF
export const cardImage = (d: { imageId: string; lang: 'fr' | 'en' }) => `${import.meta.env.BASE_URL}img-${d.lang}-hd/${d.imageId}.webp`;
