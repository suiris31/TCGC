# Interprétations des textes de cartes

Les effets sont codés d'après le texte officiel français, vérifié avec le texte anglais officiel
(en.onepiece-cardgame.com). Cette page liste les points où le texte laisse un doute, et le choix fait.
**À valider** : dis-moi si une de ces lectures ne correspond pas à ce que tu sais des règles (règles officielles,
questions-réponses Bandai, tournois).

## Vérifiés avec le texte anglais

| Carte | Doute | Choix | Texte anglais |
|---|---|---|---|
| Pointe dépilatoire (OP12-098) | Le +2000 en plus va-t-il au Personnage de coût 8 ou à la carte ciblée ? | À la carte ciblée | « that card gains an additional +2000 » |
| Monkey D. Dragon (OP13-017) | « ce Personnage » reçoit −2000 : Dragon ou celui qui allait partir ? | Dragon | « give this Character −2000 » |
| Ice Time (EB04-028), [Déclenchement] | Renvoie-t-il seulement un Personnage adverse ? | N'importe quel Personnage (les tiens aussi) | « Return up to 1 Character » |
| Zéphyr (OP12-046) | Idem | N'importe quel Personnage | « Return up to 1 Character » |
| Charlotte Cracker (ST34-002) | La mise KO dépend-elle du Leader {Équipage de Big Mom} ? | Non, seule la DON!! en dépend | « If ... add DON!!. Then, K.O. » |
| Charlotte Smoothie (P-090) | « DON!! sur le terrain adverse » : avec celles données aux cartes ? | Oui, toutes les DON!! du terrain | « DON!! cards on your opponent's field » |

## Choix faits, à valider

1. **Luffy (ST31-004), [Jouée]** : « pour chaque carte {Équipage de Chapeau de paille}, jusqu'à 1 Personnage adverse
   reçoit −1000 ». Codé comme **un seul Personnage qui reçoit −1000 par carte** (−3000 avec 3 cartes). Autre lecture
   possible : répartir les −1000 entre plusieurs Personnages.
2. **Perona (OP10-036)** : « quand un Personnage est épuisé à cause de vos effets ». Codé aussi quand on épuise un
   Personnage pour **payer le coût** d'un effet (Kuina, Hiyori qui s'épuisent).
3. **Kid (ST36-005), changement de cible** : la nouvelle cible peut être **le Leader Kidd** (lui aussi s'appelle
   Eustass "Captain" Kidd, 5000 de puissance de base) ou un Kidd Personnage **redressé**.
4. **Katakuri (Leader OP11-062), [Attaque adverse]** : utilisable à **chaque attaque adverse**, même sur un Personnage
   (le +1000 ne sert alors à rien, mais on regarde la carte du dessus du deck adverse).
5. **Monkey D. Dragon** : il peut aussi remplacer **sa propre** sortie du terrain (il est lui-même
   {Armée révolutionnaire}). Koshiro, lui, ne peut pas (« autre que ce Personnage »).
6. **Basil Hawkins, [En cas de KO]** : « jusqu'à 1 » carte de Vie adverse défaussée : toujours appliqué (c'est
   toujours avantageux).
7. **Jewelry Bonney** : c'est le joueur de Bonney qui choisit le dessus ou le dessous de la Vie adverse.
8. **Les flammes d'Ace** : le [Contre] (+3000) ne protège que le Leader ; l'effet [Principale] demande 5 DON!!
   redressées (1 pour jouer la carte, 4 à épuiser).
9. **Effets « Quand ... » pendant un autre effet** (Kuzan Leader, Perona, Katakuri ST34-001, Franky) : ils se résolvent
   **après** l'effet en cours (règles 8-6). Exemple : Sengoku regarde ses 5 cartes avant que le Leader Kuzan pioche.
10. **[Déclenchement] « jouez cette carte »** avec 5 Personnages déjà sur le terrain : on défausse un Personnage pour
    faire de la place, comme quand on joue une carte de sa main.
11. **Premier tour** : aucun des deux joueurs ne peut attaquer pendant son propre premier tour (règle 6-5-6-1).

## Comment c'est vérifié

- `tests/cards-st3x.test.ts` : un test par carte à effet (situation construite, effet joué, résultat vérifié).
- `tests/interactions.test.ts` : interactions entre decks (remplacements, restrictions, zones pleines...).
- `scripts/game/validate.ts` : des milliers de parties IA contre IA avec contrôle de cohérence à chaque décision (aucune
  carte créée ni perdue, 10 DON!! par joueur...) et rapport d'utilisation de chaque effet (`docs/validation.md`).
