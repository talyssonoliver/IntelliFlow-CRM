const resolveFromHere = (moduleName) =>
  require(require.resolve(moduleName, { paths: [__dirname] }));

module.exports = {
  plugins: [resolveFromHere('tailwindcss')(), resolveFromHere('autoprefixer')()],
};
