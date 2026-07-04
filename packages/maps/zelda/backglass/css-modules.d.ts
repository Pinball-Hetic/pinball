// CSS Modules declaration for the map package tsc (the app has its own via
// next-env.d.ts; the package must provide one itself).
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
