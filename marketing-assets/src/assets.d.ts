/** Files the bundler emits as assets: importing one gives its URL. */
declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}
