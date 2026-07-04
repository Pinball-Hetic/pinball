// CSS Modules declaration for the registry tsc (@pinball/maps follows imports
// into map components that import *.module.css).
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
