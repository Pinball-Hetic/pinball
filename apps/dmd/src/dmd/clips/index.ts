// Clips ASCII des cinématiques DMD. Format texte éditable :
//   # fps: N           → cadence
//   # commentaire       → ignoré
//   <lignes de chars>   → une frame
//   ===                 → séparateur de frame
// Mapping caractère (résolu par clip via charMap dans AsciiClipPlayer) :
//   '.' ou ' ' = éteint ; ':' = dim ; '#' = mid ; '@' = full ; '!' = accent
// Template literals (pas d'import raw) — priorité à la simplicité.

export const RAW_CLIPS = {
  // Spirale qui grandit depuis le centre et avale l'écran.
  portal_swallow: `
# fps: 3
            @
===
          :@@:
          :@@:
===
         :#@@#:
         #@@@@#
         :#@@#:
===
       :#@@@@@@#:
       #@@::::@@#
       :#@@@@@@#:
===
      #@@@@@@@@@@#
     #@::::::::::@#
     #@:#@@@@#::@#
     #@@@@@@@@@@@#
===
    #@@@@@@@@@@@@#
   #@::::::::::::@#
   #@:#@@@@@@#:@#
   #@::::::::::@#
   #@@@@@@@@@@@@#
===
  @@@@@@@@@@@@@@@@
  @::::::::::::::@
  @:#@@@@@@@@@@#:@
  @:#@::::::::@#:@
  @::::::::::::::@
  @@@@@@@@@@@@@@@@
===
 @@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@
`,

  // Un cercle géant qui pulse 2 fois.
  last_chance: `
# fps: 5
       :##:
       #@@#
       :##:
===
     :#@@@@#:
     #@@@@@@#
     :#@@@@#:
===
   :#@@@@@@@@#:
   #@@@@@@@@@@#
   :#@@@@@@@@#:
===
     :#@@@@#:
     #@@@@@@#
     :#@@@@#:
===
   :#@@@@@@@@#:
   #@@@@@@@@@@#
   :#@@@@@@@@#:
===
     :#@@@@#:
     #@@@@@@#
     :#@@@@#:
`,

  // Cadre étoilé (le score roule par-dessus en fin de clip — géré par le layout).
  hall_of_fame: `
# fps: 2
 !  :  !  :  !  :  !  :  !
 :########################:
 #                        #
 #                        #
 #                        #
 :########################:
 :  !  :  !  :  !  :  !  :
===
 :  !  :  !  :  !  :  !  :
 :########################:
 #                        #
 #                        #
 #                        #
 :########################:
 !  :  !  :  !  :  !  :  !
`,
} as const
