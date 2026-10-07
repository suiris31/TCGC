// Visuels officiels des cartes : relayés et mis en cache par le serveur TCGC (liste officielle française)
export const cardImage = (imageId: string) => `${import.meta.env.BASE_URL}img-fr-hd/${imageId}.webp`;
