// Déclaration des CSS Modules pour le tsc du package map (l'app a la sienne via
// next-env.d.ts ; le package, lui, doit la fournir).
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
