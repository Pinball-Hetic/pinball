// Déclaration des CSS Modules pour le tsc du registry (@pinball/maps suit les
// imports vers les composants map qui importent des *.module.css).
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
