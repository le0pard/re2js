// eslint-disable-next-line import/no-default-export
export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: [
          '>0.3%',
          'Firefox ESR',
          'not dead',
          'not op_mini all',
          'maintained node versions'
        ],
        modules: 'auto',
        useBuiltIns: false
      }
    ]
  ],
  plugins: []
}
