export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: ['>0.5%', 'Firefox ESR', 'not dead', 'not ie 11', 'not op_mini all'],
        modules: 'auto',
        useBuiltIns: false
      }
    ]
  ],
  plugins: []
}
