// ASCII clips for DMD cinematics. Editable text format:
//   # fps: N           → frame rate
//   # comment           → ignored
//   <char lines>        → one frame
//   ===                 → frame separator
// Character mapping (resolved per clip via charMap in AsciiClipPlayer):
//   '.' or ' ' = off; ':' = dim; '#' = mid; '@' = full; '!' = accent
// Template literals (no raw import) — simplicity first.

export const RAW_CLIPS = {
  // Spiral growing from the center, swallowing the screen.
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

  // A giant circle pulsing twice.
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

  // Starry frame (the score rolls over it at clip end — handled by the layout).
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
