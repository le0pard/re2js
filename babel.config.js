// eslint-disable-next-line import/no-default-export
export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: ['>0.5%', 'Firefox ESR', 'not dead', 'not op_mini all'],
        modules: 'auto',
        useBuiltIns: false
      }
    ]
  ],
  plugins: []
}
